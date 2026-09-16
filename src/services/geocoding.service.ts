import https from 'node:https';

/**
 * Traduce coordenadas geográficas (latitud, longitud) a una dirección legible en texto
 * utilizando la API abierta de OpenStreetMap (Nominatim).
 *
 * Características:
 * - Diseñado para emergencias SOS donde el usuario solo envía coordenadas GPS.
 * - No bloqueante con tiempo de espera máximo de 2500ms.
 * - Resiliente a fallos: ante cualquier error o timeout retorna null para no impedir el guardado de la emergencia.
 * - Encabezados descriptivos cumpliendo las políticas de uso de Nominatim.
 * - Trunca el resultado a un máximo de 255 caracteres para encajar en VARCHAR(255).
 */
export async function obtenerDireccionDesdeCoordenadas(
  latitud?: number | null,
  longitud?: number | null
): Promise<string | null> {
  if (latitud === undefined || latitud === null || longitud === undefined || longitud === null) {
    return null;
  }

  const lat = Number(latitud);
  const lon = Number(longitud);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;

  return new Promise<string | null>((resolve) => {
    let terminado = false;

    const timeout = setTimeout(() => {
      if (!terminado) {
        terminado = true;
        req.destroy();
        resolve(null);
      }
    }, 2500);

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'OfflineAid-EmergencySystem/1.0 (contacto@offlineaid.org)',
          'Accept-Language': 'es',
        },
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode !== 200) {
          clearTimeout(timeout);
          terminado = true;
          resolve(null);
          return;
        }

        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (buffer += chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          terminado = true;
          try {
            const data = JSON.parse(buffer);
            if (data && data.display_name) {
              const direccionLimpia = String(data.display_name).trim().slice(0, 255);
              resolve(direccionLimpia || null);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => {
      clearTimeout(timeout);
      terminado = true;
      resolve(null);
    });
  });
}
