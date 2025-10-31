# 🧠 Cprime Opportunity Analyzer

This project is an **AI-powered opportunity detection service** built using **Express.js**, **OpenAI GPT-5**, and **PostgreSQL**.

---

## 🚀 Overview

The Opportunity Analyzer takes **call transcripts** as input and automatically detects **business opportunities** that align with **Cprime’s capabilities** such as:
- Cloud Migration
- DevOps Transformation
- Agile & SAFe Implementation
- Atlassian & ServiceNow Integrations

---

## ⚙️ Tech Stack

- **Backend:** Node.js + Express
- **AI Model:** OpenAI GPT-5
- **Database:** PostgreSQL
- **Environment Variables:** Managed with `.env`
- **Version Control:** Git + GitHub

---

## 🧩 How It Works

1. A transcript (from a sales or client call) is sent to the API endpoint `/analyze-transcript`.
2. The Express server calls **OpenAI GPT-5** using a system prompt containing **Cprime’s capabilities**.
3. The model analyzes the text and returns structured JSON output:

```json
{
  "Summary": "The client is seeking to migrate their Jira and Confluence systems to the cloud and enhance DevOps.",
  "Opportunities": [
    {
      "OpportunityArea": "Jira and Confluence Cloud Migration",
      "RecommendedCprimeSolution": "Atlassian Cloud Migration Services with AI Migration Assist",
      "SupportingFrameworkOrPlatform": "Atlassian (Jira Software, Confluence), AI Migration Assist, Three Systems Framework",
      "ExpectedValueOrROI": "100% migration success, reduced downtime, enhanced scalability"
    }
  ]
}
