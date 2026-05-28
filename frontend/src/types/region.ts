export interface Region{
    id:number;
    name:string;
    organisation: number | null;
    is_active:boolean;
    created_at:string;
    updated_at:string;
}

export interface CreateRegionData{
    name:string;
    organisation?: number | null;
    is_active?:boolean;
}

export interface UpdateRegionData{
    name?:string;
    organisation?: number | null;
    is_active?:boolean;
}
