const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Generate a Profit and Loss (Income) Statement for a given period
// @route   GET /api/reports/profit-loss?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// @access  Private (Store Owner, Admin)
exports.getProfitLossStatement = async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return handleError(res, 400, 'Start date and end date are required for the report.');
    }

    try {
        // 1. Calculate Total Revenue
        const revenueResult = await db.query(
            `SELECT COALESCE(SUM(total_amount), 0.00) AS total_revenue
             FROM Sales
             WHERE sale_date >= $1 AND sale_date <= $2`,
            [startDate, endDate]
        );
        const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);

        // 2. Calculate Cost of Goods Sold (COGS)
        // This requires joining Sale_Items with Products to get the cost_price
        const cogsResult = await db.query(
            `SELECT COALESCE(SUM(si.quantity * p.cost_price), 0.00) AS total_cogs
             FROM Sale_Items si
             JOIN Sales s ON si.sale_id = s.sale_id
             JOIN Products p ON si.product_id = p.product_id
             WHERE s.sale_date >= $1 AND s.sale_date <= $2`,
            [startDate, endDate]
        );
        const totalCogs = parseFloat(cogsResult.rows[0].total_cogs);

        // 3. Calculate Total Fixed Expenses
        const fixedExpensesResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0.00) AS total_fixed_expenses
             FROM Expenses
             WHERE cost_type = 'Fixed' AND expense_date >= $1 AND expense_date <= $2`,
            [startDate, endDate]
        );
        const totalFixedExpenses = parseFloat(fixedExpensesResult.rows[0].total_fixed_expenses);

        // 4. Calculate Total Variable Expenses (excluding COGS, which is handled separately)
        const variableExpensesResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0.00) AS total_variable_expenses
             FROM Expenses
             WHERE cost_type = 'Variable' AND expense_date >= $1 AND expense_date <= $2`,
            [startDate, endDate]
        );
        const totalVariableExpenses = parseFloat(variableExpensesResult.rows[0].total_variable_expenses);

        // Calculations
        const grossProfit = totalRevenue - totalCogs;
        const netProfit = grossProfit - totalFixedExpenses - totalVariableExpenses;

        res.status(200).json({
            report_period: {
                startDate: startDate,
                endDate: endDate
            },
            total_revenue: totalRevenue,
            total_cogs: totalCogs,
            gross_profit: grossProfit,
            total_fixed_expenses: totalFixedExpenses,
            total_variable_expenses: totalVariableExpenses,
            net_profit: netProfit
        });

    } catch (error) {
        console.error('Error generating Profit & Loss statement:', error);
        handleError(res, 500, 'Server error generating report.');
    }
};
