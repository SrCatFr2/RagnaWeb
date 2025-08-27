const express = require('express');
const Credit = require('../models/Credit');
const Key = require('../models/Key');
const User = require('../models/User');
const router = express.Router();

// Middleware de autenticación
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Acceso no autorizado'
        });
    }
    next();
};

// Middleware para verificar si es brunomars
const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.username !== 'brunomars') {
        return res.status(403).json({
            success: false,
            message: 'Solo brunomars puede realizar esta acción'
        });
    }
    next();
};

// Obtener créditos del usuario
router.get('/balance', requireAuth, async (req, res) => {
    try {
        let creditAccount = await Credit.findOne({ 
            username: req.session.user.username 
        });

        if (!creditAccount) {
            // Crear cuenta de créditos si no existe
            creditAccount = new Credit({
                userId: req.session.user.id,
                username: req.session.user.username,
                credits: 0
            });
            await creditAccount.save();
        }

        res.json({
            success: true,
            credits: {
                current: creditAccount.credits,
                totalEarned: creditAccount.totalCreditsEarned,
                totalSpent: creditAccount.totalCreditsSpent,
                lastActivity: creditAccount.lastActivity
            }
        });

    } catch (error) {
        console.error('Error obteniendo balance:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Canjear key por créditos
router.post('/redeem', requireAuth, async (req, res) => {
    try {
        const { keyCode } = req.body;

        if (!keyCode) {
            return res.status(400).json({
                success: false,
                message: 'Código de key requerido'
            });
        }

        // Buscar la key
        const key = await Key.findOne({ 
            keyCode: keyCode.toUpperCase().trim() 
        });

        if (!key) {
            return res.status(404).json({
                success: false,
                message: 'Key no válida'
            });
        }

        // Verificar si ya fue usada
        if (key.isUsed) {
            return res.status(400).json({
                success: false,
                message: 'Esta key ya ha sido utilizada'
            });
        }

        // Verificar si expiró
        if (key.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Esta key ha expirado'
            });
        }

        // Obtener o crear cuenta de créditos
        let creditAccount = await Credit.findOne({ 
            username: req.session.user.username 
        });

        if (!creditAccount) {
            creditAccount = new Credit({
                userId: req.session.user.id,
                username: req.session.user.username,
                credits: 0
            });
        }

        // Usar la key
        await key.redeem({
            _id: req.session.user.id,
            username: req.session.user.username
        });

        // Añadir créditos
        await creditAccount.addCredits(key.credits, `Key: ${keyCode}`);

        console.log(`🔑 Key canjeada: ${keyCode} por ${req.session.user.username} (+${key.credits} créditos)`);

        res.json({
            success: true,
            message: `¡Key canjeada exitosamente! +${key.credits} créditos`,
            creditsAdded: key.credits,
            newBalance: creditAccount.credits
        });

    } catch (error) {
        console.error('Error canjeando key:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

// Generar nueva key (solo brunomars)
router.post('/generate-key', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { credits, quantity = 1 } = req.body;

        if (!credits || credits <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Cantidad de créditos debe ser mayor a 0'
            });
        }

        if (quantity <= 0 || quantity > 50) {
            return res.status(400).json({
                success: false,
                message: 'Cantidad debe ser entre 1 y 50'
            });
        }

        const generatedKeys = [];

        for (let i = 0; i < quantity; i++) {
            const keyCode = Key.generateKeyCode();

            const newKey = new Key({
                keyCode: keyCode,
                credits: parseInt(credits),
                createdBy: req.session.user.username
            });

            await newKey.save();
            generatedKeys.push({
                keyCode: keyCode,
                credits: credits
            });
        }

        console.log(`🔑 ${quantity} key(s) generada(s) por brunomars (${credits} créditos c/u)`);

        res.json({
            success: true,
            message: `${quantity} key(s) generada(s) exitosamente`,
            keys: generatedKeys
        });

    } catch (error) {
        console.error('Error generando keys:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Listar keys generadas (solo brunomars)
router.get('/keys', requireAuth, requireAdmin, async (req, res) => {
    try {
        const keys = await Key.find({ createdBy: 'brunomars' })
            .sort({ createdAt: -1 })
            .limit(100);

        const stats = await Key.aggregate([
            { $match: { createdBy: 'brunomars' } },
            {
                $group: {
                    _id: null,
                    totalKeys: { $sum: 1 },
                    usedKeys: { $sum: { $cond: ['$isUsed', 1, 0] } },
                    totalCredits: { $sum: '$credits' },
                    usedCredits: { 
                        $sum: { 
                            $cond: ['$isUsed', '$credits', 0] 
                        } 
                    }
                }
            }
        ]);

        res.json({
            success: true,
            keys: keys,
            stats: stats[0] || {
                totalKeys: 0,
                usedKeys: 0,
                totalCredits: 0,
                usedCredits: 0
            }
        });

    } catch (error) {
        console.error('Error listando keys:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Estadísticas generales de créditos (solo brunomars)
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const creditStats = await Credit.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    totalCreditsInCirculation: { $sum: '$credits' },
                    totalCreditsEarned: { $sum: '$totalCreditsEarned' },
                    totalCreditsSpent: { $sum: '$totalCreditsSpent' }
                }
            }
        ]);

        const topUsers = await Credit.find({})
            .sort({ credits: -1 })
            .limit(10)
            .select('username credits totalCreditsEarned totalCreditsSpent');

        res.json({
            success: true,
            stats: creditStats[0] || {
                totalUsers: 0,
                totalCreditsInCirculation: 0,
                totalCreditsEarned: 0,
                totalCreditsSpent: 0
            },
            topUsers: topUsers
        });

    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;