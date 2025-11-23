// SRC/comentarios.js
const express = require('express');

module.exports = (connection) => {
    const router = express.Router();

    // ==================== CREAR COMENTARIO ====================
    router.post('/', async (req, res) => {
        try {
            const { id_publicacion, id_usuario, descripcion, id_comentario_padre } = req.body;

            console.log('💬 Creando comentario:', {
                id_publicacion,
                id_usuario,
                descripcion,
                id_comentario_padre
            });

            // Validaciones
            if (!id_publicacion || !id_usuario || !descripcion) {
                return res.status(400).json({
                    success: false,
                    message: 'id_publicacion, id_usuario y descripcion son obligatorios'
                });
            }

            // Insertar comentario
            const query = `
                INSERT INTO comentarios 
                (id_publicacion, id_usuario, id_comentario_padre, descripcion) 
                VALUES (?, ?, ?, ?)
            `;

            const [result] = await connection.promise().query(query, [
                id_publicacion,
                id_usuario,
                id_comentario_padre || null,
                descripcion
            ]);

            const idComentario = result.insertId;

            // Actualizar contador de comentarios en la publicación
            await connection.promise().query(
                'UPDATE publicaciones SET cantidad_comentarios = cantidad_comentarios + 1 WHERE id_publicacion = ?',
                [id_publicacion]
            );

            // Obtener el comentario completo con datos del usuario
            const [comentarioCompleto] = await connection.promise().query(`
                SELECT 
                    c.id_comentario,
                    c.id_publicacion,
                    c.id_comentario_padre,
                    c.descripcion,
                    c.cantidad_likes,
                    c.cantidad_dislikes,
                    c.fecha_comentario,
                    u.id_usuario,
                    u.nombre,
                    u.apellido_paterno,
                    u.usuario,
                    u.foto_perfil
                FROM comentarios c
                INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
                WHERE c.id_comentario = ?
            `, [idComentario]);

            console.log('✅ Comentario creado con ID:', idComentario);

            res.status(201).json({
                success: true,
                message: 'Comentario creado exitosamente',
                data: comentarioCompleto[0]
            });

        } catch (error) {
            console.error('❌ Error al crear comentario:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== OBTENER COMENTARIOS DE UNA PUBLICACIÓN ====================
    router.get('/publicacion/:idPublicacion', async (req, res) => {
        try {
            const { idPublicacion } = req.params;

            console.log('📖 Obteniendo comentarios de publicación:', idPublicacion);

            // Obtener comentarios principales (sin padre)
            const [comentarios] = await connection.promise().query(`
                SELECT 
                    c.id_comentario,
                    c.id_publicacion,
                    c.descripcion,
                    c.cantidad_likes,
                    c.cantidad_dislikes,
                    c.fecha_comentario,
                    u.id_usuario,
                    u.nombre,
                    u.apellido_paterno,
                    u.usuario,
                    u.foto_perfil
                FROM comentarios c
                INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
                WHERE c.id_publicacion = ? AND c.id_comentario_padre IS NULL
                ORDER BY c.fecha_comentario DESC
            `, [idPublicacion]);

            // Para cada comentario, obtener sus respuestas
            for (let comentario of comentarios) {
                const [respuestas] = await connection.promise().query(`
                    SELECT 
                        c.id_comentario,
                        c.id_comentario_padre,
                        c.descripcion,
                        c.cantidad_likes,
                        c.cantidad_dislikes,
                        c.fecha_comentario,
                        u.id_usuario,
                        u.nombre,
                        u.apellido_paterno,
                        u.usuario,
                        u.foto_perfil
                    FROM comentarios c
                    INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
                    WHERE c.id_comentario_padre = ?
                    ORDER BY c.fecha_comentario ASC
                `, [comentario.id_comentario]);

                comentario.respuestas = respuestas;
            }

            console.log(`✅ ${comentarios.length} comentarios encontrados`);

            res.status(200).json({
                success: true,
                data: comentarios
            });

        } catch (error) {
            console.error('❌ Error al obtener comentarios:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== DAR/QUITAR LIKE A COMENTARIO ====================
    router.post('/like/:idComentario', async (req, res) => {
        try {
            const { idComentario } = req.params;
            const { id_usuario } = req.body;

            console.log('👍 Procesando like a comentario:', { idComentario, id_usuario });

            if (!id_usuario) {
                return res.status(400).json({
                    success: false,
                    message: 'id_usuario es obligatorio'
                });
            }

            // Verificar si ya existe el like
            const [likeExistente] = await connection.promise().query(
                'SELECT * FROM likes_comentarios WHERE id_usuario = ? AND id_comentario = ?',
                [id_usuario, idComentario]
            );

            let mensaje = '';
            let tieneLike = false;

            if (likeExistente.length > 0) {
                // Eliminar like (toggle)
                await connection.promise().query(
                    'DELETE FROM likes_comentarios WHERE id_usuario = ? AND id_comentario = ?',
                    [id_usuario, idComentario]
                );
                mensaje = 'Like eliminado';
                tieneLike = false;
                console.log('✅ Like eliminado');
            } else {
                // Agregar like
                await connection.promise().query(
                    'INSERT INTO likes_comentarios (id_usuario, id_comentario, tipo) VALUES (?, ?, "like")',
                    [id_usuario, idComentario]
                );
                mensaje = 'Like agregado';
                tieneLike = true;
                console.log('✅ Like agregado');
            }

            // Actualizar contador en comentarios
            const [likes] = await connection.promise().query(
                'SELECT COUNT(*) as total FROM likes_comentarios WHERE id_comentario = ? AND tipo = "like"',
                [idComentario]
            );

            await connection.promise().query(
                'UPDATE comentarios SET cantidad_likes = ? WHERE id_comentario = ?',
                [likes[0].total, idComentario]
            );

            res.status(200).json({
                success: true,
                message: mensaje,
                data: {
                    likes: likes[0].total,
                    tiene_like: tieneLike
                }
            });

        } catch (error) {
            console.error('❌ Error en like de comentario:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== OBTENER ESTADO DE LIKES DEL USUARIO EN COMENTARIOS ====================
    router.get('/likes/usuario/:idUsuario/publicacion/:idPublicacion', async (req, res) => {
        try {
            const { idUsuario, idPublicacion } = req.params;

            // Obtener todos los likes del usuario en los comentarios de esta publicación
            const [likes] = await connection.promise().query(`
                SELECT lc.id_comentario
                FROM likes_comentarios lc
                INNER JOIN comentarios c ON lc.id_comentario = c.id_comentario
                WHERE lc.id_usuario = ? AND c.id_publicacion = ?
            `, [idUsuario, idPublicacion]);

            // Crear un mapa de comentarios con like
            const comentariosConLike = {};
            likes.forEach(like => {
                comentariosConLike[like.id_comentario] = true;
            });

            res.status(200).json({
                success: true,
                data: comentariosConLike
            });

        } catch (error) {
            console.error('❌ Error al obtener likes:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== ELIMINAR COMENTARIO ====================
    router.delete('/:idComentario', async (req, res) => {
        try {
            const { idComentario } = req.params;
            const { id_usuario } = req.body;

            console.log('🗑️ Eliminando comentario:', { idComentario, id_usuario });

            if (!id_usuario) {
                return res.status(400).json({
                    success: false,
                    message: 'id_usuario es obligatorio'
                });
            }

            // Verificar que el comentario pertenece al usuario
            const [comentario] = await connection.promise().query(
                'SELECT id_publicacion, id_usuario FROM comentarios WHERE id_comentario = ?',
                [idComentario]
            );

            if (comentario.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Comentario no encontrado'
                });
            }

            if (comentario[0].id_usuario !== parseInt(id_usuario)) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para eliminar este comentario'
                });
            }

            const idPublicacion = comentario[0].id_publicacion;

            // Eliminar comentario (las respuestas se eliminan en cascada)
            await connection.promise().query(
                'DELETE FROM comentarios WHERE id_comentario = ?',
                [idComentario]
            );

            // Actualizar contador de comentarios en la publicación
            await connection.promise().query(
                'UPDATE publicaciones SET cantidad_comentarios = cantidad_comentarios - 1 WHERE id_publicacion = ?',
                [idPublicacion]
            );

            console.log('✅ Comentario eliminado');

            res.status(200).json({
                success: true,
                message: 'Comentario eliminado exitosamente'
            });

        } catch (error) {
            console.error('❌ Error al eliminar comentario:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    return router;
};