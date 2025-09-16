CREATE EVENT daily_overstock_log
ON SCHEDULE EVERY 1 DAY
STARTS '2025-09-15 23:59:00'
DO
    CALL LogDailyOverstocks();