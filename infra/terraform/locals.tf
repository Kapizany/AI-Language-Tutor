locals {
  resource_name = "${var.project_name}-${var.environment}"

  common_tags = {
    application = var.project_name
    environment = var.environment
    managed-by  = "terraform"
  }
}
