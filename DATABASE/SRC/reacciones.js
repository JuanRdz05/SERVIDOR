// SRC/reacciones.js
const express = require('express');

module.exports = (connection) => {
    const router = express.Router();

    // ==================== DAR/CAMBIAR LIKE/DISLIKE ====================
    router.post('/publicacion/:id', async (req, res) => {
        try {
            const { id } = req.params; // ID de la publicación
            const { id_usuario, tipo_reaccion } = req.body; // 'like' o 'dislike'

            console.log('📊 Procesando reacción:', {
                id_publicacion: id,
                id_usuario,
                tipo_reaccion
            });

            // Validaciones
            if (!id_usuario || !tipo_reaccion) {
                return res.status(400).json({
                    success: false,
                    message: 'id_usuario y tipo_reaccion son obligatorios'
                });
            }

            if (tipo_reaccion !== 'like' && tipo_reaccion !== 'dislike') {
                return res.status(400).json({
                    success: false,
                    message: 'tipo_reaccion debe ser "like" o "dislike"'
                });
            }

            // Verificar si la publicación existe
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

            // Verificar si ya existe una reacción del usuario
            const [reaccionExistente] = await connection.promise().query(
                'SELECT * FROM reacciones WHERE id_usuario = ? AND id_publicacion = ?',
                [id_usuario, id]
            );

            let mensaje = '';
            let reaccionAnterior = null;

            if (reaccionExistente.length > 0) {
                reaccionAnterior = reaccionExistente[0].tipo_reaccion;

                if (reaccionAnterior === tipo_reaccion) {
                    // Si es la misma reacción, la eliminamos (toggle)
                    await connection.promise().query(
                        'DELETE FROM reacciones WHERE id_usuario = ? AND id_publicacion = ?',
                        [id_usuario, id]
                    );
                    mensaje = `${tipo_reaccion} eliminado`;
                    console.log('✅ Reacción eliminada');
                } else {
                    // Si es diferente, actualizamos
                    await connection.promise().query(
                        'UPDATE reacciones SET tipo_reaccion = ?, fecha_reaccion = NOW() WHERE id_usuario = ? AND id_publicacion = ?',
                        [tipo_reaccion, id_usuario, id]
                    );
                    mensaje = `Cambiado de ${reaccionAnterior} a ${tipo_reaccion}`;
                    console.log('✅ Reacción actualizada');
                }
            } else {
                // No existe reacción, la creamos
                await connection.promise().query(
                    'INSERT INTO reacciones (id_usuario, id_publicacion, tipo_reaccion) VALUES (?, ?, ?)',
                    [id_usuario, id, tipo_reaccion]
                );
                mensaje = `${tipo_reaccion} agregado`;
                console.log('✅ Nueva reacción creada');
            }

            // Actualizar contadores en la tabla publicaciones
            await actualizarContadores(connection, id);

            // Obtener contadores actualizados
            const [contadores] = await connection.promise().query(
                'SELECT cantidad_likes FROM publicaciones WHERE id_publicacion = ?',
                [id]
            );

            // Calcular dislikes
            const [dislikes] = await connection.promise().query(
                'SELECT COUNT(*) as total FROM reacciones WHERE id_publicacion = ? AND tipo_reaccion = "dislike"',
                [id]
            );

            res.status(200).json({
                success: true,
                message: mensaje,
                data: {
                    likes: contadores[0].cantidad_likes,
                    dislikes: dislikes[0].total,
                    reaccion_usuario: reaccionExistente.length > 0 && reaccionAnterior === tipo_reaccion ? null : tipo_reaccion
                }
            });

        } catch (error) {
            console.error('❌ Error en reacción:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== AGREGAR/QUITAR FAVORITO ====================
    router.post('/favorito/:id', async (req, res) => {
        try {
            const { id } = req.params; // ID de la publicación
            const { id_usuario } = req.body;

            console.log('⭐ Procesando favorito:', { id_publicacion: id, id_usuario });

            if (!id_usuario) {
                return res.status(400).json({
                    success: false,
                    message: 'id_usuario es obligatorio'
                });
            }

            // Verificar si ya existe el favorito
            const [favoritoExistente] = await connection.promise().query(
                'SELECT * FROM favoritos WHERE id_usuario = ? AND id_publicacion = ?',
                [id_usuario, id]
            );

            let mensaje = '';
            let esFavorito = false;

            if (favoritoExistente.length > 0) {
                // Eliminar favorito (toggle)
                await connection.promise().query(
                    'DELETE FROM favoritos WHERE id_usuario = ? AND id_publicacion = ?',
                    [id_usuario, id]
                );
                mensaje = 'Favorito eliminado';
                esFavorito = false;
                console.log('✅ Favorito eliminado');
            } else {
                // Agregar favorito
                await connection.promise().query(
                    'INSERT INTO favoritos (id_usuario, id_publicacion) VALUES (?, ?)',
                    [id_usuario, id]
                );
                mensaje = 'Favorito agregado';
                esFavorito = true;
                console.log('✅ Favorito agregado');
            }

            // Actualizar contador en publicaciones
            await actualizarContadores(connection, id);

            // Obtener contador actualizado
            const [contadores] = await connection.promise().query(
                'SELECT cantidad_favoritos FROM publicaciones WHERE id_publicacion = ?',
                [id]
            );

            res.status(200).json({
                success: true,
                message: mensaje,
                data: {
                    favoritos: contadores[0].cantidad_favoritos,
                    es_favorito: esFavorito
                }
            });

        } catch (error) {
            console.error('❌ Error en favorito:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== OBTENER ESTADO DE REACCIONES DE UN USUARIO ====================
    router.get('/estado/:idPublicacion/:idUsuario', async (req, res) => {
        try {
            const { idPublicacion, idUsuario } = req.params;

            // Obtener reacción del usuario
            const [reaccion] = await connection.promise().query(
                'SELECT tipo_reaccion FROM reacciones WHERE id_usuario = ? AND id_publicacion = ?',
                [idUsuario, idPublicacion]
            );

            // Obtener favorito del usuario
            const [favorito] = await connection.promise().query(
                'SELECT id_favorito FROM favoritos WHERE id_usuario = ? AND id_publicacion = ?',
                [idUsuario, idPublicacion]
            );

            // Obtener contadores
            const [contadores] = await connection.promise().query(
                'SELECT cantidad_likes, cantidad_favoritos FROM publicaciones WHERE id_publicacion = ?',
                [idPublicacion]
            );

            // Contar dislikes
            const [dislikes] = await connection.promise().query(
                'SELECT COUNT(*) as total FROM reacciones WHERE id_publicacion = ? AND tipo_reaccion = "dislike"',
                [idPublicacion]
            );

            res.status(200).json({
                success: true,
                data: {
                    reaccion_usuario: reaccion.length > 0 ? reaccion[0].tipo_reaccion : null,
                    es_favorito: favorito.length > 0,
                    likes: contadores[0]?.cantidad_likes || 0,
                    dislikes: dislikes[0].total,
                    favoritos: contadores[0]?.cantidad_favoritos || 0
                }
            });

        } catch (error) {
            console.error('❌ Error al obtener estado:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    return router;
};

// ==================== FUNCIÓN AUXILIAR PARA ACTUALIZAR CONTADORES ====================
async function actualizarContadores(connection, idPublicacion) {
    // Contar likes
    const [likes] = await connection.promise().query(
        'SELECT COUNT(*) as total FROM reacciones WHERE id_publicacion = ? AND tipo_reaccion = "like"',
        [idPublicacion]
    );

    // Contar favoritos
    const [favoritos] = await connection.promise().query(
        'SELECT COUNT(*) as total FROM favoritos WHERE id_publicacion = ?',
        [idPublicacion]
    );

    // Actualizar publicación
    await connection.promise().query(
        'UPDATE publicaciones SET cantidad_likes = ?, cantidad_favoritos = ? WHERE id_publicacion = ?',
        [likes[0].total, favoritos[0].total, idPublicacion]
    );
}