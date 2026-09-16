import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { obtenerDireccionDesdeCoordenadas } from '../services/geocoding.service.js';

export const emergenciasController = {
  /**
   * Reporte integral de emergencia con evidencias fotográficas adjuntas y notificación.
   * Si no se envía dirección pero sí coordenadas (como en SOS), se resuelve automáticamente con OpenStreetMap.
   */
  reportarEmergencia: async (req: Request, res: Response): Promise<void> => {
    const { id_usuario, id_tipo, titulo, descripcion, latitud, longitud, direccion, evidencias } = req.body;

    if (!id_usuario || !id_tipo || !titulo || !descripcion) {
      res.status(400).json({ error: 'Los campos id_usuario, id_tipo, titulo y descripcion son obligatorios' });
      return;
    }

    try {
      const [usr] = await pool.query<RowDataPacket[]>('SELECT id_usuario FROM Usuarios WHERE id_usuario = ?', [id_usuario]);
      if (usr.length === 0) {
        res.status(404).json({ error: 'El usuario especificado no existe' });
        return;
      }

      const [tip] = await pool.query<RowDataPacket[]>('SELECT id_tipo, nombre, nivel_prioridad FROM TiposEmergencia WHERE id_tipo = ?', [id_tipo]);
      if (tip.length === 0) {
        res.status(404).json({ error: 'El tipo de emergencia especificado no existe' });
        return;
      }

      // Si no viene dirección manual, intentar resolverla mediante geocodificación inversa (OpenStreetMap)
      let direccionFinal = direccion !== undefined && direccion !== null && String(direccion).trim().length > 0
        ? String(direccion).trim().slice(0, 255)
        : null;

      if (!direccionFinal && latitud !== undefined && latitud !== null && longitud !== undefined && longitud !== null) {
        direccionFinal = await obtenerDireccionDesdeCoordenadas(Number(latitud), Number(longitud));
      }

      // 1. Guardar emergencia
      const [emRes] = await pool.query<ResultSetHeader>(
        `INSERT INTO Emergencias (id_usuario, id_tipo, titulo, descripcion, latitud, longitud, direccion, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
        [id_usuario, id_tipo, titulo, descripcion, latitud ?? null, longitud ?? null, direccionFinal]
      );
      const idEmergencia = emRes.insertId;

      // 2. Guardar evidencias si vienen en la petición
      const evidenciasUrls = Array.isArray(evidencias) ? evidencias.filter((u: any) => typeof u === 'string' && u.trim().length > 0) : [];
      if (evidenciasUrls.length > 0) {
        const valores = evidenciasUrls.map((url: string) => [idEmergencia, url.trim()]);
        await pool.query('INSERT INTO Evidencias (id_emergencia, url_imagen) VALUES ?', [valores]);
      }

      // 3. Notificar al usuario
      await pool.query(
        'INSERT INTO Notificaciones (id_usuario, titulo, mensaje) VALUES (?, ?, ?)',
        [id_usuario, 'Emergencia Registrada', `Tu reporte "${titulo}" (Prioridad: ${tip[0].nivel_prioridad}) fue registrado con éxito.`]
      );

      res.status(201).json({
        mensaje: 'Emergencia reportada exitosamente',
        id_emergencia: idEmergencia,
        prioridad: tip[0].nivel_prioridad,
        tipo: tip[0].nombre,
        direccion: direccionFinal,
        total_evidencias: evidenciasUrls.length,
        evidencias: evidenciasUrls,
      });
    } catch {
      res.status(500).json({ error: 'Error interno al reportar emergencia' });
    }
  },

  /**
   * Guardar o actualizar la ubicación geográfica de una emergencia activa (Slide 3).
   * Si no se especifica dirección, se resuelve automáticamente con OpenStreetMap a partir de las coordenadas.
   */
  actualizarUbicacion: async (req: Request, res: Response): Promise<void> => {
    const idEmergencia = Number(req.params.id);
    const { latitud, longitud, direccion } = req.body;

    if (latitud === undefined || longitud === undefined) {
      res.status(400).json({ error: 'Se requiere "latitud" y "longitud"' });
      return;
    }

    try {
      let direccionFinal = direccion !== undefined && direccion !== null && String(direccion).trim().length > 0
        ? String(direccion).trim().slice(0, 255)
        : null;

      if (!direccionFinal && latitud !== undefined && latitud !== null && longitud !== undefined && longitud !== null) {
        direccionFinal = await obtenerDireccionDesdeCoordenadas(Number(latitud), Number(longitud));
      }

      const [resultado] = await pool.query<ResultSetHeader>(
        'UPDATE Emergencias SET latitud = ?, longitud = ?, direccion = COALESCE(?, direccion) WHERE id_emergencia = ?',
        [latitud, longitud, direccionFinal, idEmergencia]
      );

      if (resultado.affectedRows === 0) {
        res.status(404).json({ error: 'Emergencia no encontrada' });
        return;
      }

      res.json({
        mensaje: 'Ubicación de emergencia actualizada correctamente',
        id_emergencia: idEmergencia,
        latitud,
        longitud,
        direccion: direccionFinal,
      });
    } catch {
      res.status(500).json({ error: 'Error al actualizar ubicación de la emergencia' });
    }
  },

  /**
   * Cambiar el estado de la emergencia (PENDIENTE -> EN_PROCESO -> ATENDIDA / CANCELADA).
   */
  cambiarEstado: async (req: Request, res: Response): Promise<void> => {
    const idEmergencia = Number(req.params.id);
    const { estado } = req.body;

    const estadosValidos = ['PENDIENTE', 'EN_PROCESO', 'ATENDIDA', 'CANCELADA'];
    if (!estadosValidos.includes(estado)) {
      res.status(400).json({ error: `Estado inválido. Permitidos: ${estadosValidos.join(', ')}` });
      return;
    }

    try {
      const [emFilas] = await pool.query<RowDataPacket[]>('SELECT id_usuario, titulo, estado FROM Emergencias WHERE id_emergencia = ?', [idEmergencia]);
      if (emFilas.length === 0) {
        res.status(404).json({ error: 'Emergencia no encontrada' });
        return;
      }

      const emergencia = emFilas[0];
      await pool.query('UPDATE Emergencias SET estado = ? WHERE id_emergencia = ?', [estado, idEmergencia]);

      // Si pasa a ATENDIDA, cerrar asignaciones activas
      if (estado === 'ATENDIDA') {
        await pool.query('UPDATE Asignaciones SET estado = "FINALIZADA" WHERE id_emergencia = ? AND estado != "FINALIZADA"', [idEmergencia]);
      }

      // Notificar al usuario
      await pool.query(
        'INSERT INTO Notificaciones (id_usuario, titulo, mensaje) VALUES (?, ?, ?)',
        [emergencia.id_usuario, `Actualización de Emergencia: ${estado}`, `Tu reporte "${emergencia.titulo}" cambió a estado ${estado}.`]
      );

      res.json({
        mensaje: `Estado de emergencia actualizado a ${estado}`,
        id_emergencia: idEmergencia,
        estado_anterior: emergencia.estado,
        nuevo_estado: estado,
      });
    } catch {
      res.status(500).json({ error: 'Error al cambiar estado de la emergencia' });
    }
  },

  /**
   * Vista completa 360° de la emergencia (datos, usuario, tipo, evidencias y auxilio asignado).
   */
  obtenerDetalleCompleto: async (req: Request, res: Response): Promise<void> => {
    const idEmergencia = Number(req.params.id);

    try {
      const [emFilas] = await pool.query<RowDataPacket[]>(
        `SELECT e.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.telefono AS usuario_telefono, u.correo AS usuario_correo,
                t.nombre AS tipo_nombre, t.descripcion AS tipo_descripcion, t.nivel_prioridad
         FROM Emergencias e
         INNER JOIN Usuarios u ON e.id_usuario = u.id_usuario
         INNER JOIN TiposEmergencia t ON e.id_tipo = t.id_tipo
         WHERE e.id_emergencia = ?`,
        [idEmergencia]
      );

      if (emFilas.length === 0) {
        res.status(404).json({ error: 'Emergencia no encontrada' });
        return;
      }

      const [evidencias] = await pool.query<RowDataPacket[]>('SELECT id_evidencia, url_imagen, fecha_subida FROM Evidencias WHERE id_emergencia = ?', [idEmergencia]);
      const [asignaciones] = await pool.query<RowDataPacket[]>(
        `SELECT a.id_asignacion, a.estado AS estado_asignacion, a.fecha_asignacion, i.id_institucion, i.nombre AS institucion_nombre, i.telefono AS institucion_telefono
         FROM Asignaciones a
         INNER JOIN Instituciones i ON a.id_institucion = i.id_institucion
         WHERE a.id_emergencia = ?`,
        [idEmergencia]
      );

      res.json({
        ...emFilas[0],
        evidencias,
        instituciones_asignadas: asignaciones,
      });
    } catch {
      res.status(500).json({ error: 'Error al obtener detalle de la emergencia' });
    }
  },

  /**
   * Lista de emergencias activas priorizadas por nivel de gravedad.
   */
  obtenerEmergenciasActivas: async (_req: Request, res: Response): Promise<void> => {
    try {
      const [filas] = await pool.query<RowDataPacket[]>(
        `SELECT e.*, CONCAT(u.nombre, ' ', u.apellido) AS usuario, u.telefono AS usuario_telefono,
                t.nombre AS tipo_emergencia, t.nivel_prioridad,
                (SELECT COUNT(*) FROM Evidencias ev WHERE ev.id_emergencia = e.id_emergencia) AS total_evidencias,
                (SELECT COUNT(*) FROM Asignaciones a WHERE a.id_emergencia = e.id_emergencia) AS total_asignaciones
         FROM Emergencias e
         INNER JOIN Usuarios u ON e.id_usuario = u.id_usuario
         INNER JOIN TiposEmergencia t ON e.id_tipo = t.id_tipo
         WHERE e.estado IN ('PENDIENTE', 'EN_PROCESO')
         ORDER BY FIELD(t.nivel_prioridad, 'CRITICA', 'ALTA', 'MEDIA', 'BAJA'), e.fecha_creacion DESC`
      );

      res.json(filas);
    } catch {
      res.status(500).json({ error: 'Error al obtener emergencias activas' });
    }
  },

  /**
   * Búsqueda geoespacial por radio en km utilizando la fórmula Haversine en SQL.
   */
  obtenerEmergenciasCercanas: async (req: Request, res: Response): Promise<void> => {
    const lat = Number(req.query.latitud);
    const lon = Number(req.query.longitud);
    const radioKm = Number(req.query.radio_km || 15);

    if (isNaN(lat) || isNaN(lon)) {
      res.status(400).json({ error: 'Debe proporcionar parámetros query válidos: "latitud" y "longitud"' });
      return;
    }

    try {
      const [filas] = await pool.query<RowDataPacket[]>(
        `SELECT e.*, t.nombre AS tipo_emergencia, t.nivel_prioridad,
                ROUND(
                  6371 * ACOS(
                    LEAST(1.0, GREATEST(-1.0,
                      COS(RADIANS(?)) * COS(RADIANS(e.latitud)) * COS(RADIANS(e.longitud) - RADIANS(?)) +
                      SIN(RADIANS(?)) * SIN(RADIANS(e.latitud))
                    ))
                  ), 2
                ) AS distancia_km
         FROM Emergencias e
         INNER JOIN TiposEmergencia t ON e.id_tipo = t.id_tipo
         WHERE e.latitud IS NOT NULL AND e.longitud IS NOT NULL AND e.estado IN ('PENDIENTE', 'EN_PROCESO')
         HAVING distancia_km <= ?
         ORDER BY distancia_km ASC`,
        [lat, lon, lat, radioKm]
      );

      res.json({
        coordenadas_consulta: { latitud: lat, longitud: lon },
        radio_busqueda_km: radioKm,
        total_encontradas: filas.length,
        emergencias_cercanas: filas,
      });
    } catch {
      res.status(500).json({ error: 'Error al buscar emergencias cercanas' });
    }
  },

  /**
   * Historial de emergencias de un usuario en particular.
   */
  obtenerEmergenciasPorUsuario: async (req: Request, res: Response): Promise<void> => {
    const idUsuario = Number(req.params.id_usuario);

    try {
      const [filas] = await pool.query<RowDataPacket[]>(
        `SELECT e.*, t.nombre AS tipo_emergencia, t.nivel_prioridad,
                (SELECT COUNT(*) FROM Evidencias ev WHERE ev.id_emergencia = e.id_emergencia) AS total_evidencias
         FROM Emergencias e
         INNER JOIN TiposEmergencia t ON e.id_tipo = t.id_tipo
         WHERE e.id_usuario = ?
         ORDER BY e.fecha_creacion DESC`,
        [idUsuario]
      );

      res.json(filas);
    } catch {
      res.status(500).json({ error: 'Error al obtener emergencias del usuario' });
    }
  },
};
