require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const checkerRoutes = require('./routes/checker');
const creditRoutes = require('./routes/credits'); // Nueva línea

const app = express();
const PORT = process.env.PORT || 3000;

// Conectar a MongoDB
if (process.env.MONGODB_URI) {
    connectDB();
} else {
    console.log('⚠️  MONGODB_URI no definida, usando memoria temporal');
}

// Middleware básico
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesiones
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'ragnaweb-fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
};

if (process.env.MONGODB_URI) {
    sessionConfig.store = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60
    });
}

app.use(session(sessionConfig));

// Middleware de logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path} - ${req.session?.user?.username || 'Guest'}`);
    next();
});

// Rutas
app.use('/auth', authRoutes);
app.use('/api/checker', checkerRoutes);
app.use('/api/credits', creditRoutes); // Nueva línea

// Ruta raíz
app.get('/', (req, res) => {
    try {
        if (req.session && req.session.user) {
            res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
        } else {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    } catch (error) {
        console.error('Error en ruta raíz:', error);
        res.status(500).send('Error interno del servidor');
    }
});

// Dashboard
app.get('/dashboard', (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.redirect('/');
        }
        res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).send('Error interno del servidor');
    }
});

// Página del checker
app.get('/checker', (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.redirect('/');
        }
        res.sendFile(path.join(__dirname, 'views', 'checker.html'));
    } catch (error) {
        console.error('Error en checker:', error);
        res.status(500).send('Error interno del servidor');
    }
});

// Página de créditos
app.get('/credits', (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.redirect('/');
        }
        res.sendFile(path.join(__dirname, 'views', 'credits.html'));
    } catch (error) {
        console.error('Error en credits:', error);
        res.status(500).send('Error interno del servidor');
    }
});

// Panel de admin (solo brunomars)
app.get('/admin', (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.username !== 'brunomars') {
            return res.redirect('/');
        }
        res.sendFile(path.join(__dirname, 'views', 'admin.html'));
    } catch (error) {
        console.error('Error en admin:', error);
        res.status(500).send('Error interno del servidor');
    }
});

// API de usuario
app.get('/api/user', (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }

        res.json({ 
            success: true, 
            user: {
                username: req.session.user.username,
                loginCount: req.session.user.loginCount || 0,
                lastLogin: req.session.user.lastLogin || new Date(),
                isAdmin: req.session.user.username === 'brunomars'
            }
        });
    } catch (error) {
        console.error('Error en API user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Manejo de errores global
app.use((error, req, res, next) => {
    console.error('❌ Error global:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Error interno del servidor' 
    });
});

// 404
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: `Ruta no encontrada: ${req.originalUrl}` 
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 RagnaWeb corriendo en http://localhost:${PORT}`);
    console.log(`📱 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🍃 MongoDB: ${process.env.MONGODB_URI ? 'Conectado' : 'No configurado'}`);
    console.log(`💳 Checker API disponible en /api/checker`);
    console.log(`💰 Credits API disponible en /api/credits`);
    console.log(`👑 Admin panel: /admin (solo brunomars)`);
});

// Manejo graceful de cierre
process.on('SIGTERM', () => {
    console.log('🔒 Cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔒 Cerrando servidor...');
    process.exit(0);
});