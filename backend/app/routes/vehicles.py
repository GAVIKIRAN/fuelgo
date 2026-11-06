from flask_jwt_extended import current_user
from flask_smorest import Blueprint

from ..schemas import VehicleSchema, VehicleUpdateSchema
from ..services import vehicle_service
from ..utils.decorators import role_required

blp = Blueprint("vehicles", __name__, url_prefix="/api/v1/vehicles",
                description="Vehicle management for vehicle owners")


@blp.route("", methods=["GET"])
@role_required("user")
def list_vehicles():
    return {"items": vehicle_service.list_vehicles(current_user)}


@blp.route("", methods=["POST"])
@role_required("user")
@blp.arguments(VehicleSchema)
def create_vehicle(data):
    return vehicle_service.create_vehicle(current_user, data), 201


@blp.route("/<int:vehicle_id>", methods=["PATCH"])
@role_required("user")
@blp.arguments(VehicleUpdateSchema(partial=True))
def update_vehicle(data, vehicle_id):
    return vehicle_service.update_vehicle(current_user, vehicle_id, data)


@blp.route("/<int:vehicle_id>", methods=["DELETE"])
@role_required("user")
def delete_vehicle(vehicle_id):
    vehicle_service.delete_vehicle(current_user, vehicle_id)
    return "", 204
