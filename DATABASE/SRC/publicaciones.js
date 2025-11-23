const express = require('express');
const router = express.Router();

module.exports = (connection) => {
    
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
                    GROUP_CONCAT(ip.url_imagen ORDER BY ip.orden) as imagenes
                FROM publicaciones p
                INNER JOIN usuarios u ON p.id_usuario = u.id_usuario
                LEFT JOIN imagenes_publicacion ip ON p.id_publicacion = ip.id_publicacion
                WHERE p.estado = 'activo'
                GROUP BY p.id_publicacion
                ORDER BY p.fecha_publicacion DESC
            `;
            
            const [publicaciones] = await connection.promise().query(query);
            
            // Formatear las publicaciones
            const publicacionesFormateadas = publicaciones.map(pub => ({
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
                imagenes: pub.imagenes ? pub.imagenes.split(',') : []
            }));
            
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
    
    // ==================== OBTENER PUBLICACIONES DE UN USUARIO ====================
    router.get('/usuario/:id_usuario', async (req, res) => {
        try {
            const { id_usuario } = req.params;
            
            const query = `
                SELECT 
                    p.id_publicacion,
                    p.titulo,
                    p.descripcion,
                    p.fecha_publicacion,
                    p.cantidad_likes,
                    p.cantidad_comentarios,
                    p.cantidad_favoritos,
                    GROUP_CONCAT(ip.url_imagen ORDER BY ip.orden) as imagenes
                FROM publicaciones p
                LEFT JOIN imagenes_publicacion ip ON p.id_publicacion = ip.id_publicacion
                WHERE p.id_usuario = ? AND p.estado = 'activo'
                GROUP BY p.id_publicacion
                ORDER BY p.fecha_publicacion DESC
            `;
            
            const [publicaciones] = await connection.promise().query(query, [id_usuario]);
            
            res.status(200).json({
                success: true,
                data: publicaciones.map(pub => ({
                    ...pub,
                    imagenes: pub.imagenes ? pub.imagenes.split(',') : []
                }))
            });
            
        } catch (error) {
            console.error('Error al obtener publicaciones del usuario:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener publicaciones',
                error: error.message
            });
        }
    });
    
    return router;
};