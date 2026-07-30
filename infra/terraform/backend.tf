terraform {
  backend "gcs" {
    prefix = "ai-language-tutor/main"
  }
}
