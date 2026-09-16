-- ============================================
-- OFFLINEAID - BASE DE DATOS FINAL
-- 8 ENTIDADES
-- ============================================

DROP DATABASE IF EXISTS offlineaid_in5bm;
CREATE DATABASE offlineaid_in5bm;
USE offlineaid_in5bm;


-- ============================================
-- 1. USUARIOS
-- Incluye:
-- - Roles

-- ============================================


CREATE TABLE Usuarios (

    id_usuario INT AUTO_INCREMENT PRIMARY KEY,

    nombre VARCHAR(100) NOT NULL,

    apellido VARCHAR(100) NOT NULL,

    telefono VARCHAR(20),

    correo VARCHAR(120) NOT NULL UNIQUE,

    password VARCHAR(255) NOT NULL,

    rol ENUM(
        'ADMIN',
        'CIUDADANO',
        'INSTITUCION',
        'OPERADOR'
    ) DEFAULT 'CIUDADANO',

    estado ENUM(
        'ACTIVO',
        'INACTIVO'
    ) DEFAULT 'ACTIVO',

    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);



-- ============================================
-- 2. TIPOS DE EMERGENCIA
-- ============================================

CREATE TABLE TiposEmergencia (

    id_tipo INT AUTO_INCREMENT PRIMARY KEY,

    nombre VARCHAR(100) NOT NULL UNIQUE,

    descripcion TEXT,

    nivel_prioridad ENUM(
        'BAJA',
        'MEDIA',
        'ALTA',
        'CRITICA'
    ) NOT NULL

);


-- ============================================
-- 3. EMERGENCIAS
-- Incluye el estado de la emergencia
-- ============================================

CREATE TABLE Emergencias (

    id_emergencia INT AUTO_INCREMENT PRIMARY KEY,

    id_usuario INT NOT NULL,

    id_tipo INT NOT NULL,

    titulo VARCHAR(150) NOT NULL,

    descripcion TEXT NOT NULL,

    latitud DECIMAL(10,7),

    longitud DECIMAL(10,7),

    direccion VARCHAR(255),

    estado ENUM(
        'PENDIENTE',
        'EN_PROCESO',
        'ATENDIDA',
        'CANCELADA'
    ) DEFAULT 'PENDIENTE',

    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_usuario)
        REFERENCES Usuarios(id_usuario)
        ON DELETE CASCADE,

    FOREIGN KEY (id_tipo)
        REFERENCES TiposEmergencia(id_tipo)

);


-- ============================================
-- 4. EVIDENCIAS
-- ============================================

CREATE TABLE Evidencias (

    id_evidencia INT AUTO_INCREMENT PRIMARY KEY,

    id_emergencia INT NOT NULL,

    url_imagen VARCHAR(500),

    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_emergencia)
        REFERENCES Emergencias(id_emergencia)
        ON DELETE CASCADE

);


-- ============================================
-- 5. INSTITUCIONES
-- ============================================

CREATE TABLE Instituciones (

    id_institucion INT AUTO_INCREMENT PRIMARY KEY,

    nombre VARCHAR(120) NOT NULL,

    tipo VARCHAR(80),

    telefono VARCHAR(20),

    correo VARCHAR(120),

    direccion VARCHAR(255)

);


-- ============================================
-- 6. ASIGNACIONES
-- Relaciona emergencias con instituciones
-- ============================================

CREATE TABLE Asignaciones (

    id_asignacion INT AUTO_INCREMENT PRIMARY KEY,

    id_emergencia INT NOT NULL,

    id_institucion INT NOT NULL,

    estado ENUM(
        'ASIGNADA',
        'EN_PROCESO',
        'FINALIZADA'
    ) DEFAULT 'ASIGNADA',

    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_emergencia)
        REFERENCES Emergencias(id_emergencia)
        ON DELETE CASCADE,

    FOREIGN KEY (id_institucion)
        REFERENCES Instituciones(id_institucion)

);


-- ============================================
-- 7. NOTIFICACIONES
-- ============================================

CREATE TABLE Notificaciones (

    id_notificacion INT AUTO_INCREMENT PRIMARY KEY,

    id_usuario INT NOT NULL,

    titulo VARCHAR(150),

    mensaje TEXT,

    leida BOOLEAN DEFAULT FALSE,

    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_usuario)
        REFERENCES Usuarios(id_usuario)
        ON DELETE CASCADE

);


-- ============================================
-- 8. COLA OFFLINE
-- Incluye el historial/error de sincronización
-- ============================================

CREATE TABLE ColaOffline (

    id_cola INT AUTO_INCREMENT PRIMARY KEY,

    id_usuario INT NOT NULL,

    tipo_operacion ENUM(
        'CREAR_EMERGENCIA',
        'ACTUALIZAR_EMERGENCIA',
        'SUBIR_EVIDENCIA',
        'ACTUALIZAR_UBICACION'
    ) NOT NULL,

    payload_json JSON NOT NULL,

    estado_sync ENUM(
        'PENDIENTE',
        'SINCRONIZADO',
        'ERROR'
    ) DEFAULT 'PENDIENTE',

    mensaje_error TEXT,

    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    fecha_sync TIMESTAMP NULL,

    FOREIGN KEY (id_usuario)
        REFERENCES Usuarios(id_usuario)
        ON DELETE CASCADE

);