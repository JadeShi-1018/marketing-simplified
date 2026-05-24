export interface Region{
    id:number;
    name:string;
    is_active:boolean;
    created_at:string;
    updated_at:string;
}

export interface CreateRegionData{
    name:string;
    is_active?:boolean;
}

export interface UpdateRegionData{
    name?:string;
    is_active?:boolean;
}