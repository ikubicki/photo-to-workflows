import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { Contact } from '../../fixtures/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTACTS_PATH = resolve(__dirname, '../../fixtures/contacts.json')

async function loadContacts(): Promise<Contact[]> {
  const raw = await readFile(CONTACTS_PATH, 'utf-8')
  return JSON.parse(raw) as Contact[]
}

export const getContactsTool = tool(
  async () => {
    const contacts = await loadContacts()
    return JSON.stringify(contacts, null, 2)
  },
  {
    name: 'get_contacts',
    description: 'Returns the full list of available contacts with their id, name, email, and position. Use this to find people to assign to workflow stages.',
    schema: z.object({}),
  }
)

export const getContactsCountTool = tool(
  async () => {
    const contacts = await loadContacts()
    return `Total contacts available: ${contacts.length}`
  },
  {
    name: 'get_contacts_count',
    description: 'Returns the total number of available contacts.',
    schema: z.object({}),
  }
)

export const findContactByNameTool = tool(
  async ({ name }) => {
    const contacts = await loadContacts()
    const found = contacts.filter(c =>
      c.name.toLowerCase().includes(name.toLowerCase())
    )
    if (found.length === 0) return `No contact found matching "${name}"`
    return JSON.stringify(found, null, 2)
  },
  {
    name: 'find_contact_by_name',
    description: 'Search for a contact by name (partial match). Returns matching contacts.',
    schema: z.object({
      name: z.string().describe('The name (or part of name) to search for'),
    }),
  }
)

export const findContactByPositionTool = tool(
  async ({ position }) => {
    const contacts = await loadContacts()
    const found = contacts.filter(c =>
      c.position.toLowerCase().includes(position.toLowerCase())
    )
    if (found.length === 0) return `No contact found with position matching "${position}"`
    return JSON.stringify(found, null, 2)
  },
  {
    name: 'find_contact_by_position',
    description: 'Search for contacts by position/role (partial match). Returns matching contacts. Use this to suggest a person for a stage based on the stage purpose.',
    schema: z.object({
      position: z.string().describe('The position/role to search for'),
    }),
  }
)

export const allTools = [
  getContactsTool,
  getContactsCountTool,
  findContactByNameTool,
  findContactByPositionTool,
]
