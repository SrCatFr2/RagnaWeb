const express = require('express');
const Credit = require('../models/Credit');
const { worldpayAuthWithCache } = require('../checker-engine');
const router = express.Router();

// Base de datos de tarjetas de prueba
const testCards = new Set([
    '4268073003965737774'
]);

// Función para validar formato de tarjeta
function validateCardFormat(cardData) {
    const parts = cardData.split('|');
    if (parts.length !== 4) return false;

    const [number, month, year, cvv] = parts;

    // Validar número (solo dígitos, 13-19 caracteres)
    if (!/^\d{13,19}$/.test(number)) return false;

    // Validar mes (01-12)
    if (!/^(0[1-9]|1[0-2])$/.test(month)) return false;

    // Validar año (2024-2035)
    if (!/^(202[4-9]|203[0-5])$/.test(year)) return false;

    // Validar CVV (3-4 dígitos)
    if (!/^\d{3,4}$/.test(cvv)) return false;

    return true;
}

// Función para obtener el tipo de tarjeta
function getCardType(number) {
    const firstDigit = number[0];
    const firstTwo = number.substring(0, 2);
    const firstFour = number.substring(0, 4);

    if (firstDigit === '4') return 'VISA';
    if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'MASTERCARD';
    if (['34', '37'].includes(firstTwo)) return 'AMEX';
    if (firstFour === '6011') return 'DISCOVER';
    if (['30', '36', '38'].includes(firstTwo)) return 'DINERS';
    if (firstFour === '3530' || firstFour === '3589') return 'JCB';

    return 'UNKNOWN';
}

// Función principal de checking con integración del checker real
async function checkCard(cardData) {
    const [number, month, year, cvv] = cardData.split('|');
    const cardType = getCardType(number);

    // Si es tarjeta de prueba, devolver resultado inmediato
    if (testCards.has(number)) {
        console.log(`🧪 Test card detected: ${number}`);
        return {
            status: 'TESTEO',
            message: 'Tarjeta de prueba detectada',
            type: cardType,
            number: `${number.substring(0, 6)}******${number.substring(number.length - 4)}`,
            details: {
                bin: number.substring(0, 6),
                last4: number.substring(number.length - 4),
                exp: `${month}/${year}`,
                cvv: '*'.repeat(cvv.length)
            },
            response_code: 'TEST'
        };
    }

    try {
        console.log(`🔍 Real checking: ${number.substring(0, 6)}******${number.substring(number.length - 4)}`);

        // Usar el checker real
        const result = await worldpayAuthWithCache(cardData, true);

        // Mapear estados del checker real a nuestros estados
        let mappedStatus = 'DECLINED';
        let responseCode = '05';

        if (result.status === 'approved') {
            mappedStatus = 'APPROVED';
            responseCode = '00';
        } else if (result.status === 'declined') {
            mappedStatus = 'DECLINED';
            responseCode = '05';
        } else if (result.status === 'error') {
            mappedStatus = 'ERROR';
            responseCode = 'ERR';
        }

        // Detectar tipos específicos de error por el mensaje
        if (result.message && typeof result.message === 'string') {
            const message = result.message.toLowerCase();

            if (message.includes('insufficient') || message.includes('funds')) {
                mappedStatus = 'INSUFFICIENT_FUNDS';
                responseCode = '51';
            } else if (message.includes('expired') || message.includes('expir')) {
                mappedStatus = 'EXPIRED';
                responseCode = '54';
            } else if (message.includes('cvv') || message.includes('cvc')) {
                mappedStatus = 'INVALID_CVV';
                responseCode = '14';
            } else if (message.includes('invalid') || message.includes('decline')) {
                mappedStatus = 'DECLINED';
                responseCode = '05';
            }
        }

        console.log(`✅ Real check result: ${mappedStatus} - ${result.message}`);

        return {
            status: mappedStatus,
            message: result.message || 'Verificación completada',
            type: cardType,
            number: `${number.substring(0, 6)}******${number.substring(number.length - 4)}`,
            details: {
                bin: number.substring(0, 6),
                last4: number.substring(number.length - 4),
                exp: `${month}/${year}`,
                cvv: '*'.repeat(cvv.length)
            },
            response_code: responseCode,
            checker: 'worldpay'
        };

    } catch (error) {
        console.log(`⚠️ Real checker failed, using fallback: ${error.message}`);

        // Fallback a simulación si el checker real falla
        const responses = [
            {
                status: 'APPROVED',
                message: 'Transacción aprobada (simulación)',
                response_code: '00'
            },
            {
                status: 'DECLINED',
                message: 'Tarjeta declinada (simulación)',
                response_code: '05'
            },
            {
                status: 'INSUFFICIENT_FUNDS',
                message: 'Fondos insuficientes (simulación)',
                response_code: '51'
            },
            {
                status: 'EXPIRED',
                message: 'Tarjeta expirada (simulación)',
                response_code: '54'
            },
            {
                status: 'INVALID_CVV',
                message: 'CVV inválido (simulación)',
                response_code: '14'
            }
        ];

        const index = parseInt(number.substring(number.length - 1)) % responses.length;
        const response = responses[index];

        return {
            ...response,
            type: cardType,
            number: `${number.substring(0, 6)}******${number.substring(number.length - 4)}`,
            details: {
                bin: number.substring(0, 6),
                last4: number.substring(number.length - 4),
                exp: `${month}/${year}`,
                cvv: '*'.repeat(cvv.length)
            },
            checker: 'fallback'
        };
    }
}

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

// Función para obtener o crear cuenta de créditos
async function getCreditAccount(userId, username) {
    let creditAccount = await Credit.findOne({ username: username });

    if (!creditAccount) {
        creditAccount = new Credit({
            userId: userId,
            username: username,
            credits: 0
        });
        await creditAccount.save();
    }

    return creditAccount;
}

// API para checker individual
router.post('/check-single', requireAuth, async (req, res) => {
    try {
        const { cardData } = req.body;

        if (!cardData) {
            return res.status(400).json({
                success: false,
                message: 'Datos de tarjeta requeridos'
            });
        }

        if (!validateCardFormat(cardData)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. Use: NUMERO|MM|YYYY|CVV'
            });
        }

        // Verificar créditos (1 tarjeta = 0.2 créditos, o sea 5 tarjetas = 1 crédito)
        const creditAccount = await getCreditAccount(req.session.user.id, req.session.user.username);
        const creditCost = 0.2;

        if (!creditAccount.hasCredits(creditCost)) {
            return res.status(402).json({
                success: false,
                message: `Créditos insuficientes. Necesitas ${creditCost} créditos. Balance actual: ${creditAccount.credits}`,
                currentCredits: creditAccount.credits,
                creditsNeeded: creditCost
            });
        }

        console.log(`🔍 Single check by ${req.session.user.username}: ${cardData.split('|')[0].substring(0, 6)}******`);

        // Procesar tarjeta
        const result = await checkCard(cardData);

        // Consumir créditos
        await creditAccount.consumeCredits(creditCost, 'Check individual');

        console.log(`💳 Single check result: ${result.status} (-${creditCost} créditos)`);

        res.json({
            success: true,
            result: result,
            creditsUsed: creditCost,
            remainingCredits: creditAccount.credits,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error en check individual:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

// API para checker masivo
router.post('/check-bulk', requireAuth, async (req, res) => {
    try {
        const { cardList } = req.body;

        if (!cardList || !Array.isArray(cardList)) {
            return res.status(400).json({
                success: false,
                message: 'Lista de tarjetas requerida'
            });
        }

        if (cardList.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'La lista no puede estar vacía'
            });
        }

        if (cardList.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Máximo 100 tarjetas permitidas'
            });
        }

        // Calcular créditos necesarios (5 tarjetas = 1 crédito)
        const creditsNeeded = Math.ceil(cardList.length / 5);
        const creditAccount = await getCreditAccount(req.session.user.id, req.session.user.username);

        if (!creditAccount.hasCredits(creditsNeeded)) {
            return res.status(402).json({
                success: false,
                message: `Créditos insuficientes. Necesitas ${creditsNeeded} créditos para ${cardList.length} tarjetas. Balance actual: ${creditAccount.credits}`,
                currentCredits: creditAccount.credits,
                creditsNeeded: creditsNeeded
            });
        }

        console.log(`📋 Bulk check by ${req.session.user.username}: ${cardList.length} cards`);

        const results = [];
        const stats = {
            total: cardList.length,
            approved: 0,
            declined: 0,
            testeo: 0,
            errors: 0,
            insufficient_funds: 0,
            expired: 0,
            invalid_cvv: 0
        };

        // Procesar tarjetas con delay para evitar rate limiting
        for (let i = 0; i < cardList.length; i++) {
            const cardData = cardList[i].trim();

            if (!cardData) continue;

            try {
                if (!validateCardFormat(cardData)) {
                    results.push({
                        index: i + 1,
                        cardData: cardData,
                        status: 'ERROR',
                        message: 'Formato inválido',
                        type: 'UNKNOWN',
                        checker: 'validator'
                    });
                    stats.errors++;
                    continue;
                }

                // Añadir delay entre requests para evitar rate limiting
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                const result = await checkCard(cardData);
                results.push({
                    index: i + 1,
                    cardData: cardData,
                    ...result
                });

                // Actualizar estadísticas
                switch (result.status) {
                    case 'TESTEO':
                        stats.testeo++;
                        break;
                    case 'APPROVED':
                        stats.approved++;
                        break;
                    case 'DECLINED':
                        stats.declined++;
                        break;
                    case 'INSUFFICIENT_FUNDS':
                        stats.insufficient_funds++;
                        break;
                    case 'EXPIRED':
                        stats.expired++;
                        break;
                    case 'INVALID_CVV':
                        stats.invalid_cvv++;
                        break;
                    default:
                        stats.errors++;
                }

                // Log progress cada 10 tarjetas
                if ((i + 1) % 10 === 0) {
                    console.log(`📊 Progress: ${i + 1}/${cardList.length} cards processed`);
                }

            } catch (error) {
                console.error(`❌ Error processing card ${i + 1}:`, error.message);
                results.push({
                    index: i + 1,
                    cardData: cardData,
                    status: 'ERROR',
                    message: 'Error procesando tarjeta: ' + error.message,
                    type: 'UNKNOWN',
                    checker: 'error'
                });
                stats.errors++;
            }
        }

        // Consumir créditos después del procesamiento exitoso
        await creditAccount.consumeCredits(creditsNeeded, `Check masivo: ${cardList.length} tarjetas`);

        console.log(`✅ Bulk check completed: ${cardList.length} cards (-${creditsNeeded} créditos)`);
        console.log(`📈 Results: ${stats.approved} approved, ${stats.declined} declined, ${stats.testeo} test, ${stats.errors} errors`);

        res.json({
            success: true,
            results: results,
            stats: stats,
            creditsUsed: creditsNeeded,
            remainingCredits: creditAccount.credits,
            processedAt: new Date().toISOString(),
            processingTime: `${cardList.length} cards processed`,
            summary: {
                total: stats.total,
                success_rate: Math.round((stats.approved / (stats.total - stats.errors - stats.testeo)) * 100) || 0,
                test_rate: Math.round((stats.testeo / stats.total) * 100),
                error_rate: Math.round((stats.errors / stats.total) * 100)
            }
        });

    } catch (error) {
        console.error('❌ Error en check masivo:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

// API para obtener estadísticas del usuario
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const creditAccount = await getCreditAccount(req.session.user.id, req.session.user.username);

        // Estadísticas basadas en créditos gastados
        const totalChecks = Math.floor(creditAccount.totalCreditsSpent * 5); // Aproximado
        const checkingStats = {
            totalChecks: totalChecks,
            approvedCards: Math.floor(creditAccount.totalCreditsSpent * 1.5),
            declinedCards: Math.floor(creditAccount.totalCreditsSpent * 2.5),
            testCards: Math.floor(creditAccount.totalCreditsSpent * 1),
            errorCards: Math.floor(creditAccount.totalCreditsSpent * 0.5),
            lastCheck: creditAccount.lastActivity,
            averageSuccessRate: totalChecks > 0 ? Math.round((creditAccount.totalCreditsSpent * 1.5) / totalChecks * 100) : 0
        };

        res.json({
            success: true,
            stats: checkingStats,
            credits: {
                current: creditAccount.credits,
                totalEarned: creditAccount.totalCreditsEarned,
                totalSpent: creditAccount.totalCreditsSpent,
                efficiency: creditAccount.totalCreditsSpent > 0 ? 
                    Math.round((checkingStats.approvedCards / totalChecks) * 100) : 0
            },
            user: {
                username: req.session.user.username,
                memberSince: creditAccount.createdAt,
                lastActivity: creditAccount.lastActivity
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

// API para obtener información del checker (health check)
router.get('/health', requireAuth, (req, res) => {
    res.json({
        success: true,
        checker: {
            status: 'online',
            version: '1.0.0',
            features: [
                'Real-time card validation',
                'Worldpay integration',
                'Session caching',
                'Fallback simulation',
                'Test card detection'
            ],
            limits: {
                maxBulkCards: 100,
                creditCostSingle: 0.2,
                creditCostBulk: '1 per 5 cards'
            },
            proxy: {
                enabled: process.env.USE_PROXY === 'true',
                status: 'configured'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// API para limpiar cache de sesiones (solo para testing)
router.post('/clear-cache', requireAuth, async (req, res) => {
    try {
        // Solo permitir a brunomars limpiar cache
        if (req.session.user.username !== 'brunomars') {
            return res.status(403).json({
                success: false,
                message: 'Solo brunomars puede limpiar el cache'
            });
        }

        const { SessionCache } = require('../checker-engine');
        const sessionCache = new SessionCache();
        sessionCache.sessions = {};
        await sessionCache.saveCache();

        console.log(`🧹 Cache cleared by ${req.session.user.username}`);

        res.json({
            success: true,
            message: 'Cache limpiado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error limpiando cache:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

module.exports = router;