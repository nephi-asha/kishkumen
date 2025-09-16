
CREATE PROCEDURE LogDailyOverstocks();
BEGIN

    DELETE FROM overstocks WHERE DATE(created_at) = CURDATE();
    

    INSERT INTO overstocks (product_id, quantity_left)
    SELECT p.product_id, p.quantity_left
    FROM products p
    WHERE p.quantity_left > 0;
END;