
CREATE PROCEDURE LogDailyOverstocks();
BEGIN

    DELETE FROM overstocks WHERE DATE(created_at) = CURDATE();
    

    INSERT INTO overstocks (product_id, quantity_left)
    SELECT p.product_id, p.quantity_left
    FROM products p
    WHERE p.quantity_left > 0;
END;

pg_dump -h dpg-d2pjl8je5dus73b7013g-a.oregon-postgres.render.com -U admin -d bakery_test_nttw --clean --if-exists --no-owner --no-privileges > render_dump.sql
vB1OaNSwVF0185O7