require('dotenv').config();
const mongoose = require('mongoose');

async function fixDatabase() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🍃 Conectado a MongoDB');

        // Obtener la colección de usuarios
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Listar todos los índices
        const indexes = await usersCollection.indexes();
        console.log('📋 Índices actuales:', indexes);

        // Eliminar el índice de email si existe
        try {
            await usersCollection.dropIndex('email_1');
            console.log('✅ Índice de email eliminado');
        } catch (error) {
            console.log('ℹ️  Índice de email no encontrado (esto está bien)');
        }

        // Eliminar documentos con email null si existen
        const result = await usersCollection.deleteMany({ email: null });
        console.log(`🗑️  Documentos con email null eliminados: ${result.deletedCount}`);

        // Verificar usuarios existentes
        const users = await usersCollection.find({}).toArray();
        console.log('👥 Usuarios en la base de datos:');
        users.forEach(user => {
            console.log(`  - ${user.username} (ID: ${user._id})`);
        });

        console.log('✅ Base de datos limpiada correctamente');

    } catch (error) {
        console.error('❌ Error limpiando base de datos:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔒 Conexión cerrada');
    }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
    fixDatabase();
}

module.exports = fixDatabase;