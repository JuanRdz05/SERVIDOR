// SRC/publicaciones.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = (connection) => {
    const router = express.Router();

    // ==================== CONFIGURACIÓN DE MULTER ====================
    // IMPORTANTE: Debe ir ANTES de usar 'upload' en las rutas
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = './uploads/publicaciones';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.jpg';
            const uniqueName = `publicacion_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
            cb(null, uniqueName);
        }
    });

    const upload = multer({
        storage: storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB por imagen
        fileFilter: (req, file, cb) => {
            const allowedMimeTypes = [
                'image/jpeg',
                'image/jpg',
                'image/png',
                'image/gif',
                'image/webp',
                'application/octet-stream'
            ];

            const allowedExtensions = /jpeg|jpg|png|gif|webp/;
            const extname = path.extname(file.originalname).toLowerCase();
            const isExtensionValid = allowedExtensions.test(extname.replace('.', ''));
            const isMimeTypeValid = allowedMimeTypes.some(type =>
                file.mimetype.startsWith('image/') || type === file.mimetype
            );

            if (isExtensionValid || isMimeTypeValid) {
                return cb(null, true);
            } else {
                cb(new Error('Solo se permiten imágenes'));
            }
        }
    });

    // ==================== CREAR PUBLICACIÓN ====================
    router.post('/', upload.array('imagenes', 3), async (req, res) => {
        try {
            const { id_usuario, titulo, descripcion } = req.body;

            console.log('📝 Creando publicación...');
            console.log('Datos:', { id_usuario, titulo, descripcion });
            console.log('Imágenes recibidas:', req.files?.length || 0);

            // Validaciones
            if (!id_usuario || !titulo) {
                return res.status(400).json({
                    success: false,
                    message: 'El ID de usuario y título son obligatorios'
                });
            }

            // Insertar publicación en la base de datos
            const queryPublicacion = `
                INSERT INTO publicaciones 
                (id_usuario, titulo, descripcion) 
                VALUES (?, ?, ?)
            `;

            const [result] = await connection.promise().query(queryPublicacion, [
                id_usuario,
                titulo,
                descripcion || null
            ]);

            const idPublicacion = result.insertId;
            console.log('✅ Publicación creada con ID:', idPublicacion);

            // Guardar imágenes si existen
            const imagenesUrls = [];
            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const urlImagen = `/uploads/publicaciones/${file.filename}`;

                    console.log(`📸 Guardando imagen ${i + 1}:`, {
                        filename: file.filename,
                        path: file.path,
                        url: urlImagen
                    });

                    // Insertar imagen en la tabla imagenes_publicacion
                    await connection.promise().query(
                        'INSERT INTO imagenes_publicacion (id_publicacion, url_imagen, orden) VALUES (?, ?, ?)',
                        [idPublicacion, urlImagen, i]
                    );

                    imagenesUrls.push(urlImagen);
                }
            }

            // Obtener los datos completos de la publicación creada
            const [publicaciones] = await connection.promise().query(`
                SELECT 
                    p.id_publicacion,
                    p.titulo,
                    p.descripcion,
                    p.fecha_publicacion,
                    p.cantidad_likes,
                    p.cantidad_comentarios,
                    p.cantidad_favoritos,
                    u.id_usuario,
                    u.nombre,
                    u.apellido_paterno,
                    u.usuario,
                    u.foto_perfil
                FROM publicaciones p
                INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_publicacion = ?
            `, [idPublicacion]);

            const publicacion = publicaciones[0];

            res.status(201).json({
                success: true,
                message: 'Publicación creada exitosamente',
                publicacion: {
                    id_publicacion: publicacion.id_publicacion,
                    titulo: publicacion.titulo,
                    descripcion: publicacion.descripcion,
                    fecha_publicacion: publicacion.fecha_publicacion,
                    cantidad_likes: publicacion.cantidad_likes,
                    cantidad_comentarios: publicacion.cantidad_comentarios,
                    cantidad_favoritos: publicacion.cantidad_favoritos,
                    usuario: {
                        id_usuario: publicacion.id_usuario,
                        nombre: publicacion.nombre,
                        apellido_paterno: publicacion.apellido_paterno,
                        usuario: publicacion.usuario,
                        foto_perfil: publicacion.foto_perfil
                    },
                    imagenes: imagenesUrls
                }
            });

        } catch (error) {
            console.error('❌ Error al crear publicación:', error);
            
            // Limpiar archivos subidos en caso de error
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlink(file.path, (err) => {
                        if (err) console.error('Error al eliminar archivo:', err);
                    });
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });
    
    // ==================== OBTENER TODAS LAS PUBLICACIONES ====================
    router.get('/', async (req, res) => {
        try {
            const query = `
                SELECT 
                    p.id_publicacion,
                    p.titulo,
                    p.descripcion,
                    p.fecha_publicacion,
                    p.cantidad_likes,
                    p.cantidad_comentarios,
                    p.cantidad_favoritos,
                    p.estado,
                    u.id_usuario,
                    u.nombre,
                    u.apellido_paterno,
                    u.usuario,
                    u.foto_perfil,
                    GROUP_CONCAT(ip.url_imagen ORDER BY ip.orden SEPARATOR '|||') as imagenes
                FROM publicaciones p
                INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
                LEFT JOIN imagenes_publicacion ip ON p.id_publicacion = ip.id_publicacion
                WHERE p.estado = 'activo'
                GROUP BY p.id_publicacion
                ORDER BY p.fecha_publicacion DESC
            `;
            
            const [publicaciones] = await connection.promise().query(query);
            
            // Formatear las publicaciones
            const publicacionesFormateadas = publicaciones.map(pub => {
                const imagenes = pub.imagenes ? pub.imagenes.split('|||') : [];
                
                return {
                    id_publicacion: pub.id_publicacion,
                    titulo: pub.titulo,
                    descripcion: pub.descripcion,
                    fecha_publicacion: pub.fecha_publicacion,
                    cantidad_likes: pub.cantidad_likes,
                    cantidad_comentarios: pub.cantidad_comentarios,
                    cantidad_favoritos: pub.cantidad_favoritos,
                    usuario: {
                        id_usuario: pub.id_usuario,
                        nombre: pub.nombre,
                        apellido_paterno: pub.apellido_paterno,
                        usuario: pub.usuario,
                        foto_perfil: pub.foto_perfil
                    },
                    imagenes: imagenes
                };
            });
            
            res.status(200).json({
                success: true,
                data: publicacionesFormateadas
            });
            
        } catch (error) {
            console.error('Error al obtener publicaciones:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener publicaciones',
                error: error.message
            });
        }
    });

// ==================== OBTENER FAVORITOS DE UN USUARIO ====================
router.get('/favoritos/:idUsuario', async (req, res) => {
    try {
        const { idUsuario } = req.params;

        console.log(`⭐ Obteniendo favoritos del usuario ${idUsuario}`);

        const query = `
            SELECT 
                p.id_publicacion,
                p.titulo,
                p.descripcion,
                p.fecha_publicacion,
                p.cantidad_likes,
                p.cantidad_comentarios,
                p.cantidad_favoritos,
                p.estado,
                u.id_usuario,
                u.nombre,
                u.apellido_paterno,
                u.usuario,
                u.foto_perfil,
                GROUP_CONCAT(ip.url_imagen ORDER BY ip.orden SEPARATOR '|||') as imagenes
            FROM publicaciones p
            INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
            INNER JOIN favoritos f ON p.id_publicacion = f.id_publicacion
            LEFT JOIN imagenes_publicacion ip ON p.id_publicacion = ip.id_publicacion
            WHERE f.id_usuario = ? AND p.estado = 'activo'
            GROUP BY p.id_publicacion
            ORDER BY f.fecha_guardado DESC
        `;
        
        const [publicaciones] = await connection.promise().query(query, [idUsuario]);
        
        console.log(`✅ ${publicaciones.length} favoritos encontrados`);
        
        // Formatear las publicaciones
        const publicacionesFormateadas = publicaciones.map(pub => {
            const imagenes = pub.imagenes ? pub.imagenes.split('|||') : [];
            
            return {
                id_publicacion: pub.id_publicacion,
                titulo: pub.titulo,
                descripcion: pub.descripcion,
                fecha_publicacion: pub.fecha_publicacion,
                cantidad_likes: pub.cantidad_likes,
                cantidad_comentarios: pub.cantidad_comentarios,
                cantidad_favoritos: pub.cantidad_favoritos,
                usuario: {
                    id_usuario: pub.id_usuario,
                    nombre: pub.nombre,
                    apellido_paterno: pub.apellido_paterno,
                    usuario: pub.usuario,
                    foto_perfil: pub.foto_perfil
                },
                imagenes: imagenes
            };
        });
        
        res.status(200).json({
            success: true,
            data: publicacionesFormateadas
        });
        
    } catch (error) {
        console.error('❌ Error al obtener favoritos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener favoritos',
            error: error.message
        });
    }
});

    // ==================== ELIMINAR PUBLICACIÓN ====================
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { id_usuario } = req.body; // Opcional: para verificar que el usuario sea el propietario

            console.log('🗑️ Eliminando publicación:', { id_publicacion: id, id_usuario });

            // Verificar que la publicación existe
            const [publicacion] = await connection.promise().query(
                'SELECT id_publicacion, id_usuario FROM publicaciones WHERE id_publicacion = ?',
                [id]
            );

            if (publicacion.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Publicación no encontrada'
                });
            }

            // Opcional: Verificar que el usuario sea el propietario
            if (id_usuario && publicacion[0].id_usuario !== parseInt(id_usuario)) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para eliminar esta publicación'
                });
            }

            // Obtener las imágenes antes de eliminar
            const [imagenes] = await connection.promise().query(
                'SELECT url_imagen FROM imagenes_publicacion WHERE id_publicacion = ?',
                [id]
            );

            // Eliminar las imágenes físicas del servidor
            imagenes.forEach(img => {
                const filePath = `.${img.url_imagen}`;
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error al eliminar imagen:', filePath, err);
                    } else {
                        console.log('✅ Imagen eliminada:', filePath);
                    }
                });
            });

            // Eliminar registros relacionados
            await connection.promise().query(
                'DELETE FROM imagenes_publicacion WHERE id_publicacion = ?',
                [id]
            );

            await connection.promise().query(
                'DELETE FROM reacciones WHERE id_publicacion = ?',
                [id]
            );

            await connection.promise().query(
                'DELETE FROM favoritos WHERE id_publicacion = ?',
                [id]
            );

            await connection.promise().query(
                'DELETE FROM comentarios WHERE id_publicacion = ?',
                [id]
            );

            // Finalmente, eliminar la publicación
            await connection.promise().query(
                'DELETE FROM publicaciones WHERE id_publicacion = ?',
                [id]
            );

            console.log('✅ Publicación eliminada exitosamente');

            res.status(200).json({
                success: true,
                message: 'Publicación eliminada exitosamente'
            });

        } catch (error) {
            console.error('❌ Error al eliminar publicación:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== ACTUALIZAR PUBLICACIÓN ====================
    router.put('/:id', upload.array('imagenes', 3), async (req, res) => {
        try {
            const { id } = req.params;
            const { titulo, descripcion, imagenes_a_mantener } = req.body;

            console.log('📝 Actualizando publicación:', { id, titulo, descripcion });

            // Verificar que la publicación existe
            const [publicacion] = await connection.promise().query(
                'SELECT id_publicacion FROM publicaciones WHERE id_publicacion = ?',
                [id]
            );

            if (publicacion.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Publicación no encontrada'
                });
            }

            // Actualizar la publicación
            await connection.promise().query(
                'UPDATE publicaciones SET titulo = ?, descripcion = ? WHERE id_publicacion = ?',
                [titulo, descripcion || null, id]
            );

            // Manejar imágenes si se proporcionaron nuevas
            if (req.files && req.files.length > 0) {
                // Obtener imágenes actuales
                const [imagenesActuales] = await connection.promise().query(
                    'SELECT url_imagen FROM imagenes_publicacion WHERE id_publicacion = ?',
                    [id]
                );

                // Eliminar imágenes físicas antiguas
                imagenesActuales.forEach(img => {
                    const filePath = `.${img.url_imagen}`;
                    fs.unlink(filePath, (err) => {
                        if (err) console.error('Error al eliminar imagen:', err);
                    });
                });

                // Eliminar registros de imágenes antiguas
                await connection.promise().query(
                    'DELETE FROM imagenes_publicacion WHERE id_publicacion = ?',
                    [id]
                );

                // Insertar nuevas imágenes
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const urlImagen = `/uploads/publicaciones/${file.filename}`;

                    await connection.promise().query(
                        'INSERT INTO imagenes_publicacion (id_publicacion, url_imagen, orden) VALUES (?, ?, ?)',
                        [id, urlImagen, i]
                    );
                }
            }

            // Obtener la publicación actualizada
            const [publicacionActualizada] = await connection.promise().query(`
                SELECT 
                    p.id_publicacion,
                    p.titulo,
                    p.descripcion,
                    p.fecha_publicacion,
                    p.cantidad_likes,
                    p.cantidad_comentarios,
                    p.cantidad_favoritos,
                    u.id_usuario,
                    u.nombre,
                    u.apellido_paterno,
                    u.usuario,
                    u.foto_perfil,
                    GROUP_CONCAT(ip.url_imagen ORDER BY ip.orden SEPARATOR '|||') as imagenes
                FROM publicaciones p
                INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
                LEFT JOIN imagenes_publicacion ip ON p.id_publicacion = ip.id_publicacion
                WHERE p.id_publicacion = ?
                GROUP BY p.id_publicacion
            `, [id]);

            const pub = publicacionActualizada[0];
            const imagenes = pub.imagenes ? pub.imagenes.split('|||') : [];

            res.status(200).json({
                success: true,
                message: 'Publicación actualizada exitosamente',
                publicacion: {
                    id_publicacion: pub.id_publicacion,
                    titulo: pub.titulo,
                    descripcion: pub.descripcion,
                    fecha_publicacion: pub.fecha_publicacion,
                    cantidad_likes: pub.cantidad_likes,
                    cantidad_comentarios: pub.cantidad_comentarios,
                    cantidad_favoritos: pub.cantidad_favoritos,
                    usuario: {
                        id_usuario: pub.id_usuario,
                        nombre: pub.nombre,
                        apellido_paterno: pub.apellido_paterno,
                        usuario: pub.usuario,
                        foto_perfil: pub.foto_perfil
                    },
                    imagenes: imagenes
                }
            });

        } catch (error) {
            console.error('❌ Error al actualizar publicación:', error);
            
            // Limpiar archivos subidos en caso de error
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlink(file.path, (err) => {
                        if (err) console.error('Error al eliminar archivo:', err);
                    });
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });
    
    return router;
};