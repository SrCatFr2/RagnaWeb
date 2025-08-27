const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`🍃 MongoDB conectado: ${conn.connection.host}`);
        console.log(`📊 Base de datos: ${conn.connection.name}`);

        // Verificar y limpiar índices problemáticos
        const db = conn.connection.db;
        try {
            const collections = await db.listCollections().toArray();

            for (const collection of collections) {
                if (collection.name === 'users') {
                    const usersCollection = db.collection('users');
                    const indexes = await usersCollection.indexes();

                    // Buscar índice de email
                    const emailIndex = indexes.find(index => index.name === 'email_1');
                    if (emailIndex) {
                        console.log('⚠️  Índice de email encontrado, eliminando...');
                        try {
                            await usersCollection.dropIndex('email_1');
                            console.log('✅ Índice de email eliminado');
                        } catch (dropError) {
                            console.log('ℹ️  No se pudo eliminar el índice de email');
                        }
                    }
                }
            }
        } catch (indexError) {
            console.log('ℹ️  No se pudieron verificar los índices');
        }

        // Eventos de conexión
        mongoose.connection.on('error', (err) => {
            console.error('❌ Error de MongoDB:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('🔌 MongoDB desconectado');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('🔒 Conexión MongoDB cerrada por terminación de la app');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);

        // Si es error de índice duplicado, intentar limpiar
        if (error.message.includes('E11000') && error.message.includes('email')) {
            console.log('🔧 Intentando limpiar base de datos...');
            // Aquí podrías llamar a la función de limpieza
        }

        process.exit(1);
    }
};

module.exports = connectDB;