const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const connection = require('./CONFIG/database');

// ==================== MIDDLEWARES ====================
// IMPORTANTE: Los middlewares deben ir ANTES de las rutas
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// ==================== CONFIGURACIÓN DE MULTER ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/avatars';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const uniqueName = `avatar_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: (req, file, cb) => {
        console.log('📸 Archivo recibido:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            fieldname: file.fieldname
        });

        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/gif',
            'image/webp',
            'image/*',
            'application/octet-stream'
        ];

        const allowedExtensions = /jpeg|jpg|png|gif|webp/;
        const extname = path.extname(file.originalname).toLowerCase();
        const isExtensionValid = allowedExtensions.test(extname.replace('.', ''));
        const isMimeTypeValid = allowedMimeTypes.some(type => 
            file.mimetype.startsWith('image/') || type === file.mimetype
        );

        if (isExtensionValid || isMimeTypeValid) {
            console.log('✅ Imagen aceptada');
            return cb(null, true);
        } else {
            console.log('❌ Imagen rechazada - mimetype:', file.mimetype);
            cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// ==================== VALIDACIONES ====================
const validarEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

const validarContrasena = (password) => {
    if (password.length < 10) return false;
    
    const tieneMayuscula = /[A-Z]/.test(password);
    const tieneMinuscula = /[a-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    
    return tieneMayuscula && tieneMinuscula && tieneNumero;
};

// ==================== REGISTRO Y LOGIN ====================

app.post('/api/registro', upload.single('foto_perfil'), async (req, res) => {
    try {
        console.log('📝 Datos recibidos:', req.body);
        console.log('📸 Archivo:', req.file);

        const {
            nombre,
            apellido_paterno,
            apellido_materno,
            usuario,
            correo_electronico,
            contrasena,
            telefono
        } = req.body;

        // Validaciones obligatorias
        if (!nombre || !apellido_paterno || !usuario || !correo_electronico || !contrasena) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos obligatorios: nombre, apellido_paterno, usuario, correo_electronico, contraseña'
            });
        }

        // Validar formato de email
        if (!validarEmail(correo_electronico)) {
            return res.status(400).json({
                success: false,
                message: 'El formato del correo electrónico no es válido'
            });
        }

        // Validar contraseña
        if (!validarContrasena(contrasena)) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener mínimo 10 caracteres, una mayúscula, una minúscula y un número'
            });
        }

        // Verificar si el usuario ya existe
        const [usuarioExistente] = await connection.promise().query(
            'SELECT * FROM usuarios WHERE usuario = ? OR correo_electronico = ?',
            [usuario, correo_electronico]
        );

        if (usuarioExistente.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'El usuario o correo electrónico ya están registrados'
            });
        }

        // Encriptar contraseña
        const hashedPassword = await bcrypt.hash(contrasena, 10);

        // Ruta de la foto de perfil (si se subió)
        const fotoPerfil = req.file ? `/uploads/avatars/${req.file.filename}` : null;

        // Insertar usuario en la base de datos
        const query = `
            INSERT INTO usuarios 
            (nombre, apellido_paterno, apellido_materno, usuario, correo_electronico, contrasena, foto_perfil, telefono) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.promise().query(query, [
            nombre,
            apellido_paterno,
            apellido_materno || null,
            usuario,
            correo_electronico,
            hashedPassword,
            fotoPerfil,
            telefono || null
        ]);

        console.log('✅ Usuario registrado con ID:', result.insertId);

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            data: {
                id_usuario: result.insertId,
                nombre,
                apellido_paterno,
                apellido_materno,
                usuario,
                correo_electronico,
                foto_perfil: fotoPerfil,
                telefono
            }
        });

    } catch (error) {
        console.error('❌ Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { usuario, contrasena } = req.body;

        if (!usuario || !contrasena) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son obligatorios'
            });
        }

        const query = 'SELECT * FROM usuarios WHERE usuario = ? OR correo_electronico = ?';
        const [usuarios] = await connection.promise().query(query, [usuario, usuario]);

        if (usuarios.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas'
            });
        }

        const usuarioEncontrado = usuarios[0];

        const passwordValida = await bcrypt.compare(contrasena, usuarioEncontrado.contrasena);

        if (!passwordValida) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas'
            });
        }

        const { contrasena: _, ...datosUsuario } = usuarioEncontrado;

        res.status(200).json({
            success: true,
            message: 'Login exitoso',
            data: datosUsuario
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

// ==================== RUTAS MODULARES ====================

// Importar y registrar rutas de módulos
const publicacionesRoutes = require('./SRC/publicaciones');
const reaccionesRoutes = require('./SRC/reacciones');
const comentariosRoutes = require('./SRC/comentarios');
const perfilRoutes = require('./SRC/perfil');

app.use('/api/publicaciones', publicacionesRoutes(connection));
app.use('/api/reacciones', reaccionesRoutes(connection));
app.use('/api/comentarios', comentariosRoutes(connection));
app.use('/api/usuarios', perfilRoutes(connection));

// ==================== RUTA DE PRUEBA ====================
app.get('/test', (req, res) => {
    res.json({ message: 'Servidor funcionando correctamente ✅' });
});

// ==================== INICIAR SERVIDOR ====================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📋 Rutas disponibles:`);
    console.log(`   AUTH:`);
    console.log(`   - POST /api/registro`);
    console.log(`   - POST /api/login`);
    console.log(`   PUBLICACIONES:`);
    console.log(`   - GET    /api/publicaciones`);
    console.log(`   - POST   /api/publicaciones`);
    console.log(`   - DELETE /api/publicaciones/:id`);
    console.log(`   - PUT    /api/publicaciones/:id`);
    console.log(`   REACCIONES:`);
    console.log(`   - POST /api/reacciones/publicacion/:id`);
    console.log(`   - POST /api/reacciones/favorito/:id`);
    console.log(`   - GET  /api/reacciones/estado/:idPub/:idUser`);
    console.log(`   COMENTARIOS:`);
    console.log(`   - GET    /api/comentarios/publicacion/:idPublicacion`);
    console.log(`   - POST   /api/comentarios`);
    console.log(`   - POST   /api/comentarios/like/:idComentario`);
    console.log(`   - DELETE /api/comentarios/:idComentario`);
    console.log(`   PERFIL:`);
    console.log(`   - PUT /api/usuarios/:id`);
    console.log(`   - PUT /api/usuarios/:id/foto`);
});