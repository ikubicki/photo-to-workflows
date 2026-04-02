# Vision — Workflow Visual Analyzer

## Purpose

Application that takes an image of an approval workflow diagram, interprets it using AI vision, and builds a structured workflow object with matched contacts from the organization.

## Problem Statement

Manually translating visual approval workflow diagrams into structured, machine-readable data is tedious and error-prone. Organizations have workflow diagrams drawn on whiteboards, in tools, or on paper — but no automated way to convert them into actionable data linked to actual team members.

## Solution

A two-step AI pipeline:
1. **Vision model** reads the diagram image and produces a structured text description of stages, participants, dependencies, and conditions
2. **Reasoning model** takes that description plus the organization's contact list and builds a typed Workflow JSON object with fuzzy-matched participants

## Target Users

- Solo developer / prototype consumer
- Internal teams needing quick workflow digitization

## Project Goals

- **Prototype**: Demonstrate feasibility of AI-powered workflow diagram interpretation
- Accurately extract stages, participants, roles, and dependencies from workflow diagram images
- Match diagram participants to real organization contacts using fuzzy matching
- Produce a structured, typed Workflow JSON output

## Non-Goals (Current Phase)

- Production deployment / scaling
- User authentication / multi-tenancy
- Workflow editing or execution
- Persistent storage of analyzed workflows
