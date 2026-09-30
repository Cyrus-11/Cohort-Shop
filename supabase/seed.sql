-- Fixed IDs make this safe to re-run without replacing later product edits.
-- Amounts are integer kobo (100 kobo = NGN 1).
insert into public.products (id, name, description, image_path, price_kobo, is_active)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Everyday Tee',
    'A soft sage cotton T-shirt with an easy, relaxed fit.',
    '/products/everyday-tee.jpg',
    1200000,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Relaxed Shirt',
    'A navy linen button-up shirt for easy everyday layering.',
    '/products/relaxed-shirt.jpg',
    2200000,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Straight-Leg Jeans',
    'Slate blue straight-leg jeans with a clean, classic cut.',
    '/products/straight-leg-jeans.jpg',
    2800000,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'Weekend Hoodie',
    'A soft white pullover with a hood and kangaroo pocket.',
    '/products/weekend-hoodie.jpg',
    3000000,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'Linen Dress',
    'A breezy terracotta belted shirt dress with patch pockets.',
    '/products/linen-dress.jpg',
    3500000,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'Denim Jacket',
    'A classic indigo denim jacket with a corduroy collar and chest pockets.',
    '/products/denim-jacket.jpg',
    4200000,
    true
  )
on conflict (id) do nothing;
