import { Customer } from './customer';

export interface Organisation{
id: number
name: string
organization: number | null
domains: string[]
industry: string
plan: string
region: number | null
customers: Customer[]
created_at: string
updated_at: string
}

export interface CreateOrganisationData{
name: string
organization?: number | null
domains?: string[]
industry?: string
plan?: string
region?: number | null
}

export interface UpdateOrganisationData{
name?: string
organization?: number | null
domains?: string[]
industry?: string
plan?: string
region?: number | null
}                
    