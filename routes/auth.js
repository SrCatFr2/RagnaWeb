const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Registro de usuario
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validaciones básicas
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuario y contraseña requeridos' 
            });
        }

        if (username.length < 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'El usuario debe tener al menos 3 caracteres' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }

        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'El usuario ya existe' 
            });
        }

        // Crear nuevo usuario
        const newUser = new User({
            username: username.toLowerCase(),
            password: password
        });

        await newUser.save();

        console.log(`✅ Usuario registrado: ${username} - ID: ${newUser._id}`);
        res.status(201).json({ 
            success: true, 
            message: 'Usuario registrado exitosamente',
            userId: newUser._id
        });

    } catch (error) {
        console.error('❌ Error en registro:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false, 
                message: messages.join(', ')
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Login de usuario
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuario y contraseña requeridos' 
            });
        }

        // Buscar usuario
        const user = await User.findOne({ 
            username: username.toLowerCase(),
            isActive: true 
        });

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas' 
            });
        }

        // Verificar contraseña
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales incorrectas' 
            });
        }

        // Actualizar último login
        await user.updateLastLogin();

        // Crear sesión
        req.session.user = { 
            id: user._id,
            username: user.username,
            loginCount: user.loginCount,
            lastLogin: user.lastLogin
        };

        console.log(`🔐 Login exitoso: ${username} - Total logins: ${user.loginCount}`);

        res.json({ 
            success: true, 
            message: 'Login exitoso',
            redirect: '/dashboard',
            user: {
                username: user.username,
                loginCount: user.loginCount
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        const username = req.session.user?.username;

        req.session.destroy((err) => {
            if (err) {
                console.error('❌ Error al destruir sesión:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al cerrar sesión' 
                });
            }

            console.log(`👋 Logout exitoso: ${username}`);
            res.json({ 
                success: true, 
                message: 'Sesión cerrada exitosamente' 
            });
        });
    } catch (error) {
        console.error('❌ Error en logout:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// Obtener estadísticas de usuarios (ruta protegida)
router.get('/stats', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'No autenticado' 
            });
        }

        const totalUsers = await User.countDocuments({ isActive: true });
        const recentUsers = await User.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('username createdAt loginCount lastLogin');

        res.json({
            success: true,
            stats: {
                totalUsers,
                recentUsers
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

module.exports = router;