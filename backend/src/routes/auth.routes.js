// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');

router.post('/onboard/init', authCtrl.onboardInit);
router.get('/onboard/callback', authCtrl.onboardCallback);
router.post('/onboard/webhook', authCtrl.onboardWebhook); // secure this endpoint in prod
router.post('/login', authCtrl.login);
router.post('/refresh', authCtrl.refreshToken);
router.post('/logout', authCtrl.logout);



module.exports = router;
