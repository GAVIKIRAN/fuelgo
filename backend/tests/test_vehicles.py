def test_vehicle_crud(client, auth):
    h = auth("cust@test.in")
    res = client.post("/api/v1/vehicles", headers=h, json={
        "make": "Honda", "model": "City", "registration_number": "ka 09 mx 4455", "fuel_type": "petrol"})
    assert res.status_code == 201
    vid = res.get_json()["id"]
    assert res.get_json()["registration_number"] == "KA09MX4455"

    items = client.get("/api/v1/vehicles", headers=h).get_json()["items"]
    assert len(items) == 2

    res = client.patch(f"/api/v1/vehicles/{vid}", headers=h, json={"model": "City Hybrid"})
    assert res.status_code == 200 and res.get_json()["model"] == "City Hybrid"

    assert client.delete(f"/api/v1/vehicles/{vid}", headers=h).status_code == 204
    assert len(client.get("/api/v1/vehicles", headers=h).get_json()["items"]) == 1


def test_duplicate_registration(client, auth):
    res = client.post("/api/v1/vehicles", headers=auth("other@test.in"), json={
        "make": "X", "model": "Y", "registration_number": "KA09AB1234", "fuel_type": "petrol"})
    assert res.status_code == 409


def test_invalid_registration_format(client, auth):
    res = client.post("/api/v1/vehicles", headers=auth("cust@test.in"), json={
        "make": "X", "model": "Y", "registration_number": "12345678", "fuel_type": "petrol"})
    assert res.status_code == 422


def test_cannot_touch_other_users_vehicle(client, auth):
    vid = client.get("/api/v1/vehicles", headers=auth("cust@test.in")).get_json()["items"][0]["id"]
    h = auth("other@test.in")
    assert client.patch(f"/api/v1/vehicles/{vid}", headers=h, json={"model": "Z"}).status_code == 404
    assert client.delete(f"/api/v1/vehicles/{vid}", headers=h).status_code == 404
