const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost', // Tu servidor de MySQL
    user: 'root', // Tu usuario de MySQL
    password: 'root', // Tu contraseña
    database: 'app_moviles'
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión a MySQL:', err);
        return;
    }
    console.log('📌 Conexión a MySQL establecida');
});

module.exports = connection;
