from datetime import datetime, timezone
import pytest
import io

from app.models.user import User


PASSWORD = "Strong-password-123"


async def add_user(
    app_context,
    *,
    email: str = "student@campus.edu",
    student_id: str | None = None,
    verified: bool = True,
    active: bool = True,
) -> User:
    app, session_factory = app_context
    user = User(
        email=email,
        student_id=student_id,
        password_hash=app.state.password_service.hash(PASSWORD),
        email_verified_at=datetime.now(timezone.utc) if verified else None,
        is_active=active,
    )
    async with session_factory() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


def auth_header(app_context, user: User) -> dict[str, str]:
    token = app_context[0].state.jwt_service.issue_access_token(user.id).token
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_categories(client, app_context):
    response = await client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 8
    names = [c["name"] for c in data]
    assert "Academic Books" in names
    assert "Calculators" in names
    assert "Laptops & Electronics" in names


@pytest.mark.asyncio
async def test_create_product_requires_authentication(client):
    response = await client.post(
        "/api/products",
        json={
            "title": "Algorithms Textbook",
            "category": "Academic Books",
            "condition": "Used - Good",
            "product_type": "For Sale",
            "price": 2500,
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_product_success(client, app_context):
    seller = await add_user(
        app_context, email="seller1@campus.edu", student_id="ITBIN11223344"
    )
    headers = auth_header(app_context, seller)

    payload = {
        "title": "Casio fx-991EX Calculator",
        "description": "Like-new scientific calculator for engineering.",
        "category": "Calculators",
        "condition": "Like New",
        "product_type": "For Rent",
        "price": 300,
        "rental_price_per_day": 50,
        "rental_duration": "Per week",
        "location": "Main Library",
        "status": "available",
        "images": ["https://example.com/calc1.jpg", "https://example.com/calc2.jpg"],
    }

    response = await client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["seller_id"] == str(seller.id)
    assert data["seller_name"] == "ITBIN11223344"
    assert data["seller_student_id"] == "ITBIN11223344"
    assert data["condition"] == "Like New"
    assert data["product_type"] == "For Rent"
    assert len(data["images"]) == 2
    assert data["seller_score"] == 100
    assert data["rating"] == 0.0
    assert data["reviews_count"] == 0


@pytest.mark.asyncio
async def test_create_product_validation(client, app_context):
    seller = await add_user(app_context, email="seller_val@campus.edu")
    headers = auth_header(app_context, seller)

    # Invalid condition
    res = await client.post(
        "/api/products",
        json={
            "title": "Bad item",
            "category": "Other",
            "condition": "Broken",  # Not in allowed list
            "product_type": "For Sale",
            "price": 100,
        },
        headers=headers,
    )
    assert res.status_code == 422

    # Negative price
    res2 = await client.post(
        "/api/products",
        json={
            "title": "Bad price",
            "category": "Other",
            "condition": "New",
            "product_type": "For Sale",
            "price": -50,
        },
        headers=headers,
    )
    assert res2.status_code == 422


@pytest.mark.asyncio
async def test_get_products_filtering_and_search(client, app_context):
    seller = await add_user(app_context, email="seller2@campus.edu")
    headers = auth_header(app_context, seller)

    # Create 3 products
    p1 = {
        "title": "Linear Algebra Notes",
        "category": "Course Materials",
        "condition": "Good",
        "product_type": "For Sale",
        "price": 500,
        "images": [],
    }
    p2 = {
        "title": "Dell XPS 13 Laptop",
        "category": "Laptops & Electronics",
        "condition": "Like New",
        "product_type": "For Sale",
        "price": 150000,
        "images": [],
    }
    p3 = {
        "title": "Lab Microscope",
        "category": "Lab Equipment",
        "condition": "Used - Good",
        "product_type": "For Rent",
        "price": 1000,
        "rental_price_per_day": 200,
        "images": [],
    }
    await client.post("/api/products", json=p1, headers=headers)
    await client.post("/api/products", json=p2, headers=headers)
    await client.post("/api/products", json=p3, headers=headers)

    # Search by keyword
    search_res = await client.get("/api/products?q=Laptop")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["total"] == 1
    assert search_data["items"][0]["title"] == "Dell XPS 13 Laptop"

    # Filter by category
    cat_res = await client.get("/api/products?category=Course Materials")
    assert cat_res.status_code == 200
    cat_data = cat_res.json()
    assert cat_data["total"] == 1
    assert cat_data["items"][0]["title"] == "Linear Algebra Notes"

    # Filter by product_type
    type_res = await client.get("/api/products?product_type=For Rent")
    assert type_res.status_code == 200
    type_data = type_res.json()
    assert any(item["title"] == "Lab Microscope" for item in type_data["items"])

    # Price range filter
    price_res = await client.get("/api/products?min_price=400&max_price=800")
    assert price_res.status_code == 200
    price_data = price_res.json()
    assert price_data["total"] == 1
    assert price_data["items"][0]["title"] == "Linear Algebra Notes"


@pytest.mark.asyncio
async def test_update_product_authorization(client, app_context):
    owner = await add_user(app_context, email="owner@campus.edu")
    stranger = await add_user(app_context, email="stranger@campus.edu")
    owner_headers = auth_header(app_context, owner)
    stranger_headers = auth_header(app_context, stranger)

    create_res = await client.post(
        "/api/products",
        json={
            "title": "Physics Textbook Vol 1",
            "category": "Academic Books",
            "condition": "Good",
            "product_type": "For Sale",
            "price": 1200,
            "images": ["https://example.com/p1.jpg"],
        },
        headers=owner_headers,
    )
    product_id = create_res.json()["id"]

    # Stranger tries to update -> 403 Forbidden
    unauthorized_res = await client.put(
        f"/api/products/{product_id}",
        json={"title": "Hacked title"},
        headers=stranger_headers,
    )
    assert unauthorized_res.status_code == 403

    # Owner updates -> 200 OK
    update_res = await client.put(
        f"/api/products/{product_id}",
        json={"title": "Physics Textbook Vol 1 & 2", "price": 1800},
        headers=owner_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Physics Textbook Vol 1 & 2"
    assert update_res.json()["price"] == 1800


@pytest.mark.asyncio
async def test_delete_product_authorization(client, app_context):
    owner = await add_user(app_context, email="owner_del@campus.edu")
    stranger = await add_user(app_context, email="stranger_del@campus.edu")
    owner_headers = auth_header(app_context, owner)
    stranger_headers = auth_header(app_context, stranger)

    create_res = await client.post(
        "/api/products",
        json={
            "title": "Desk Lamp",
            "category": "Hostel Items",
            "condition": "Good",
            "product_type": "For Sale",
            "price": 900,
            "images": [],
        },
        headers=owner_headers,
    )
    product_id = create_res.json()["id"]

    # Stranger tries to delete -> 403
    forbidden_del = await client.delete(
        f"/api/products/{product_id}", headers=stranger_headers
    )
    assert forbidden_del.status_code == 403

    # Owner deletes -> 204
    owner_del = await client.delete(
        f"/api/products/{product_id}", headers=owner_headers
    )
    assert owner_del.status_code == 204

    # Now verify product is gone
    get_res = await client.get(f"/api/products/{product_id}")
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_upload_image(client, app_context):
    user = await add_user(app_context, email="uploader@campus.edu")
    headers = auth_header(app_context, user)

    # Valid image upload
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 50
    files = {"file": ("test.png", io.BytesIO(fake_png), "image/png")}

    response = await client.post(
        "/api/products/images/upload",
        files=files,
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert data["url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_reviews_full_lifecycle(client, app_context):
    seller = await add_user(
        app_context, email="seller_rev@campus.edu", student_id="ITBIN99887766"
    )
    buyer1 = await add_user(
        app_context, email="buyer1@campus.edu", student_id="ITBIN11112222"
    )
    buyer2 = await add_user(
        app_context, email="buyer2@campus.edu", student_id="ITBIN33334444"
    )

    seller_headers = auth_header(app_context, seller)
    buyer1_headers = auth_header(app_context, buyer1)
    buyer2_headers = auth_header(app_context, buyer2)

    # Seller creates a product
    prod_res = await client.post(
        "/api/products",
        json={
            "title": "Organic Chemistry Model Kit",
            "category": "Lab Equipment",
            "condition": "Like New",
            "product_type": "For Sale",
            "price": 3500,
            "images": [],
        },
        headers=seller_headers,
    )
    product_id = prod_res.json()["id"]

    # 1. Seller cannot review their own product
    self_rev = await client.post(
        f"/api/products/{product_id}/reviews",
        json={"rating": 5, "comment": "I am great!"},
        headers=seller_headers,
    )
    assert self_rev.status_code == 400
    assert "cannot submit reviews for their own listings" in self_rev.text

    # 2. Buyer 1 submits valid review
    b1_rev = await client.post(
        f"/api/products/{product_id}/reviews",
        json={"rating": 5, "comment": "Excellent kit, smooth handover on campus."},
        headers=buyer1_headers,
    )
    assert b1_rev.status_code == 201
    rev_data = b1_rev.json()
    review_id = rev_data["id"]
    assert rev_data["rating"] == 5
    assert rev_data["user_student_id"] == "ITBIN11112222"

    # 3. Buyer 1 cannot submit duplicate review
    dup_rev = await client.post(
        f"/api/products/{product_id}/reviews",
        json={"rating": 4, "comment": "Second review attempt."},
        headers=buyer1_headers,
    )
    assert dup_rev.status_code == 400
    assert "already submitted a review" in dup_rev.text

    # 4. Buyer 2 submits 4-star review
    b2_rev = await client.post(
        f"/api/products/{product_id}/reviews",
        json={"rating": 4, "comment": "Good quality, fast pickup."},
        headers=buyer2_headers,
    )
    assert b2_rev.status_code == 201

    # 5. Get product reviews
    reviews_res = await client.get(f"/api/products/{product_id}/reviews")
    assert reviews_res.status_code == 200
    r_list = reviews_res.json()
    assert r_list["total"] == 2
    assert r_list["average_rating"] == 4.5

    # 6. Check seller reputation score
    rep_res = await client.get(f"/api/sellers/{seller.id}/reputation")
    assert rep_res.status_code == 200
    rep_data = rep_res.json()
    assert rep_data["seller_id"] == str(seller.id)
    assert rep_data["total_reviews"] == 2
    assert rep_data["average_rating"] == 4.5
    # (4.5 / 5) * 100 = 90
    assert rep_data["score"] == 90
    assert rep_data["total_products"] == 1

    # 7. Check "My Reviews" for Buyer 1
    my_revs = await client.get("/api/reviews/my", headers=buyer1_headers)
    assert my_revs.status_code == 200
    my_data = my_revs.json()
    assert my_data["total"] == 1
    assert my_data["items"][0]["id"] == review_id

    # 8. Buyer 2 tries to edit Buyer 1's review -> 403 Forbidden
    unauth_edit = await client.put(
        f"/api/reviews/{review_id}",
        json={"comment": "Tampered comment"},
        headers=buyer2_headers,
    )
    assert unauth_edit.status_code == 403

    # 9. Buyer 1 updates their own review -> 200
    edit_res = await client.put(
        f"/api/reviews/{review_id}",
        json={"rating": 5, "comment": "Updated: Perfect condition, very satisfied."},
        headers=buyer1_headers,
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["comment"] == "Updated: Perfect condition, very satisfied."

    # 10. Buyer 1 deletes their review -> 204
    del_res = await client.delete(
        f"/api/reviews/{review_id}", headers=buyer1_headers
    )
    assert del_res.status_code == 204

    # Check reviews count afterwards
    after_del = await client.get(f"/api/products/{product_id}/reviews")
    assert after_del.json()["total"] == 1
