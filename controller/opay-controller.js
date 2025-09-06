const db = require('../database/db'); 
const hmac = require('crypto');
const jwt = require('jsonwebtoken'); 

const OPAY_SECRET_KEY = process.env.OPAY_SECRET_KEY || 'OPAYPRV17571212308620.7871132011413308';

exports.handleOpayCallback = async (req, res) => {
    console.log("OPay callback received.");

    const { payload, sha512: receivedSignature } = req.body;

    if (!payload || !receivedSignature) {
        console.error("Missing payload or signature in callback.");
        return res.status(400).send('Invalid request body');
    }
    const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
    
    const expectedSignature = hmac.createHmac('sha512', OPAY_SECRET_KEY)
        .update(payloadStr)
        .digest('hex');

    if (expectedSignature !== receivedSignature) {
        console.error("Signature verification failed. Potential tampering detected.");
        return res.status(403).send('Signature validation failed');
    }

    console.log("OPay signature successfully verified.");

    console.log("OPay Callback Payload:", payload);

    const { orderId, status, amount, transactionId } = payload;

    if (status === 'SUCCESS') {
        return res.status(200).json({ message: 'Payment processed successfully', amount });
    }

    if (status === 'FAILED') {
        return res.status(200).json({ message: 'Payment not received' });
    }
}
