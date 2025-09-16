const express = require('express');
const router = express.Router();
const defectController = require('../controller/defect-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/', defectController.getAllDefects);

router.get('/:id', defectController.getDefectById);

router.post('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker']), defectController.createDefects);

module.exports = router;


