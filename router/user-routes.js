const express = require('express');
const router = express.Router();
const userController = require('../controller/user-controller');
const { authorizeRoles } = require('../middleware/auth'); // Import authorizeRoles



router.post('/add-staff', authorizeRoles(['Store Owner', 'Admin']), userController.addStaffMember);

router.get('/my-bakery', userController.getBakeryUsers);

router.get('/:id', userController.getUserById);

router.put('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker', 'Cashier', 'Super Admin']), userController.updateUser);

router.put('/:id/roles', authorizeRoles(['Store Owner', 'Super Admin']), userController.updateUserRoles);

router.delete('/:id', authorizeRoles(['Store Owner', 'Admin', 'Super Admin']), userController.deleteUser);

// router.get('/all-bakeries-users', authorizeRoles(['Super Admin']), userController.getAllUsersSuperAdmin);
// router.get('/all-bakeries', authorizeRoles(['Super Admin']), userController.getAllBakeriesSuperAdmin);

module.exports = router;
