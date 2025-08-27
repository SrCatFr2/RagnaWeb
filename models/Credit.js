const mongoose = require('mongoose');

const creditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    username: {
        type: String,
        required: true
    },
    credits: {
        type: Number,
        default: 0,
        min: 0
    },
    totalCreditsEarned: {
        type: Number,
        default: 0
    },
    totalCreditsSpent: {
        type: Number,
        default: 0
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Método para añadir créditos
creditSchema.methods.addCredits = function(amount, reason = 'Key redemption') {
    this.credits += amount;
    this.totalCreditsEarned += amount;
    this.lastActivity = new Date();

    console.log(`💰 +${amount} créditos para ${this.username}: ${reason}`);
    return this.save();
};

// Método para consumir créditos
creditSchema.methods.consumeCredits = function(amount, reason = 'Card checking') {
    if (this.credits < amount) {
        throw new Error('Créditos insuficientes');
    }

    this.credits -= amount;
    this.totalCreditsSpent += amount;
    this.lastActivity = new Date();

    console.log(`💸 -${amount} créditos para ${this.username}: ${reason}`);
    return this.save();
};

// Método para verificar si tiene suficientes créditos
creditSchema.methods.hasCredits = function(amount) {
    return this.credits >= amount;
};

module.exports = mongoose.model('Credit', creditSchema);