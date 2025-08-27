const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
    keyCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    credits: {
        type: Number,
        required: true,
        min: 1
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: String,
        required: true
    },
    usedBy: {
        username: String,
        userId: mongoose.Schema.Types.ObjectId,
        usedAt: Date
    },
    expiresAt: {
        type: Date,
        default: function() {
            return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
        }
    }
}, {
    timestamps: true
});

// Método para generar código de key
keySchema.statics.generateKeyCode = function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'RGNA-';
    for (let i = 0; i < 12; i++) {
        if (i === 4 || i === 8) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Método para usar la key
keySchema.methods.redeem = async function(user) {
    if (this.isUsed) {
        throw new Error('Esta key ya ha sido utilizada');
    }

    if (this.expiresAt < new Date()) {
        throw new Error('Esta key ha expirado');
    }

    this.isUsed = true;
    this.usedBy = {
        username: user.username,
        userId: user._id,
        usedAt: new Date()
    };

    return await this.save();
};

module.exports = mongoose.model('Key', keySchema);