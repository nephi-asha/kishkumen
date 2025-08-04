const express = require('express');
const router = express.Router();
const expenseController = require('../controller/expense-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), expenseController.getAllExpenses);

router.get('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker']), expenseController.getExpenseById);

router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), expenseController.createExpense);

router.put('/:id', authorizeRoles(['Store Owner', 'Admin']), expenseController.updateExpense);

router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), expenseController.deleteExpense);

module.exports = router;
