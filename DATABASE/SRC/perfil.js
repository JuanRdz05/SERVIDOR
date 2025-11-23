// SRC/perfil.js
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = (connection) => {
    const router = express.Router();

    // Configuración de Multer para fotos de perfil
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
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: (req, file, cb) => {
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
                return cb(null, true);
            } else {
                cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
            }
        }
    });

    // Función de validación de contraseña
    const validarContrasena = (password) => {
        if (password.length < 10) return false;
        const tieneMayuscula = /[A-Z]/.test(password);
        const tieneMinuscula = /[a-z]/.test(password);
        const tieneNumero = /[0-9]/.test(password);
        return tieneMayuscula && tieneMinuscula && tieneNumero;
    };

    /**
     * PUT /:id - Actualizar información del perfil
     */
    router.put('/:id', async (req, res) => {
        try {
            const userId = parseInt(req.params.id);
            const { nombre, apellidoPaterno, apellidoMaterno, telefono, contrasena } = req.body;

            console.log('📝 Actualizando usuario ID:', userId);
            console.log('📋 Datos recibidos:', req.body);

            // Validaciones
            if (!nombre || !apellidoPaterno) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre y apellido paterno son obligatorios'
                });
            }

            // Validar contraseña si se proporciona
            if (contrasena && contrasena.trim() !== '') {
                if (!validarContrasena(contrasena)) {
                    return res.status(400).json({
                        success: false,
                        message: 'La contraseña debe tener mínimo 10 caracteres, una mayúscula, una minúscula y un número'
                    });
                }
            }

            // Construir la consulta dinámica
            let updateFields = [];
            let values = [];

            updateFields.push('nombre = ?');
            values.push(nombre);

            updateFields.push('apellido_paterno = ?');
            values.push(apellidoPaterno);

            updateFields.push('apellido_materno = ?');
            values.push(apellidoMaterno || null);

            updateFields.push('telefono = ?');
            values.push(telefono || null);

            // Si hay contraseña nueva, hashearla
            if (contrasena && contrasena.trim() !== '') {
                const hashedPassword = await bcrypt.hash(contrasena, 10);
                updateFields.push('contrasena = ?');
                values.push(hashedPassword);
            }

            // Agregar el ID al final
            values.push(userId);

            const query = `
                UPDATE usuarios 
                SET ${updateFields.join(', ')}
                WHERE id_usuario = ?
            `;

            const [result] = await connection.promise().query(query, values);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            // Obtener los datos actualizados del usuario
            const [usuarios] = await connection.promise().query(
                'SELECT id_usuario, nombre, apellido_paterno, apellido_materno, usuario, correo_electronico, foto_perfil, telefono, fecha_registro FROM usuarios WHERE id_usuario = ?',
                [userId]
            );

            console.log('✅ Usuario actualizado exitosamente');

            res.status(200).json({
                success: true,
                message: 'Perfil actualizado exitosamente',
                usuario: usuarios[0]
            });

        } catch (error) {
            console.error('❌ Error al actualizar perfil:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * PUT /:id/foto - Actualizar foto de perfil
     */
    router.put('/:id/foto', upload.single('foto'), async (req, res) => {
        try {
            const userId = parseInt(req.params.id);

            console.log('🖼️ Actualizando foto de perfil para usuario:', userId);
            console.log('📸 Archivo recibido:', req.file);

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No se recibió ninguna imagen'
                });
            }

            // Obtener la foto actual del usuario para eliminarla
            const [usuarios] = await connection.promise().query(
                'SELECT foto_perfil FROM usuarios WHERE id_usuario = ?',
                [userId]
            );

            if (usuarios.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            // Eliminar foto anterior si existe
            const fotoAnterior = usuarios[0].foto_perfil;
            if (fotoAnterior) {
                const rutaAnterior = path.join(__dirname, '..', fotoAnterior);
                if (fs.existsSync(rutaAnterior)) {
                    fs.unlinkSync(rutaAnterior);
                    console.log('🗑️ Foto anterior eliminada:', fotoAnterior);
                }
            }

            // Actualizar la base de datos con la nueva foto
            const nuevaFotoUrl = `/uploads/avatars/${req.file.filename}`;

            await connection.promise().query(
                'UPDATE usuarios SET foto_perfil = ? WHERE id_usuario = ?',
                [nuevaFotoUrl, userId]
            );

            console.log('✅ Foto de perfil actualizada exitosamente');

            res.status(200).json({
                success: true,
                message: 'Foto de perfil actualizada exitosamente',
                fotoPerfil: nuevaFotoUrl
            });

        } catch (error) {
            console.error('❌ Error al actualizar foto:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    return router;
};