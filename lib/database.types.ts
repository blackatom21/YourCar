
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "job_parts": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string,"name": string,"part_number": string | null,"quantity": number,"sort_order": number,"unit_cost_cents": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id": string,"name": string,"part_number"?: string | null,"quantity"?: number,"sort_order"?: number,"unit_cost_cents"?: number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string,"name"?: string,"part_number"?: string | null,"quantity"?: number,"sort_order"?: number,"unit_cost_cents"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_parts_job_id_user_id_fkey"
      columns: ["job_id","user_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"job_photos": {
                  Row: {
                    "caption": string | null,"created_at": string,"height": number | null,"id": string,"job_id": string,"sort_order": number,"storage_path": string,"user_id": string,"width": number | null
                  }
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"job_id": string,"sort_order"?: number,"storage_path": string,"user_id"?: string,"width"?: number | null
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"job_id"?: string,"sort_order"?: number,"storage_path"?: string,"user_id"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_photos_job_id_user_id_fkey"
      columns: ["job_id","user_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"job_videos": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string,"original_url": string,"sort_order": number,"start_seconds": number | null,"title": string | null,"user_id": string,"youtube_video_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id": string,"original_url": string,"sort_order"?: number,"start_seconds"?: number | null,"title"?: string | null,"user_id"?: string,"youtube_video_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string,"original_url"?: string,"sort_order"?: number,"start_seconds"?: number | null,"title"?: string | null,"user_id"?: string,"youtube_video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_videos_job_id_user_id_fkey"
      columns: ["job_id","user_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"labor_minutes": number | null,"mileage": number | null,"performed_on": string,"reminder_id": string | null,"title": string,"total_cost_cents": number,"total_cost_is_manual": boolean,"type": Database["public"]['Enums']["job_type"],"updated_at": string,"user_id": string,"vehicle_id": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"labor_minutes"?: number | null,"mileage"?: number | null,"performed_on"?: string,"reminder_id"?: string | null,"title": string,"total_cost_cents"?: number,"total_cost_is_manual"?: boolean,"type": Database["public"]['Enums']["job_type"],"updated_at"?: string,"user_id"?: string,"vehicle_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"labor_minutes"?: number | null,"mileage"?: number | null,"performed_on"?: string,"reminder_id"?: string | null,"title"?: string,"total_cost_cents"?: number,"total_cost_is_manual"?: boolean,"type"?: Database["public"]['Enums']["job_type"],"updated_at"?: string,"user_id"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_reminder_id_user_id_fkey"
      columns: ["reminder_id","user_id"]
isOneToOne: false
      referencedRelation: "reminder_status"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "jobs_reminder_id_user_id_fkey"
      columns: ["reminder_id","user_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "jobs_vehicle_id_user_id_fkey"
      columns: ["vehicle_id","user_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"currency": string,"display_name": string | null,"distance_unit": string,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string | null,"distance_unit"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string | null,"distance_unit"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reminders": {
                  Row: {
                    "active": boolean,"created_at": string,"due_soon_days": number,"due_soon_miles": number,"id": string,"interval_miles": number | null,"interval_months": number | null,"last_done_mileage": number | null,"last_done_on": string | null,"title": string,"updated_at": string,"user_id": string,"vehicle_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"due_soon_days"?: number,"due_soon_miles"?: number,"id"?: string,"interval_miles"?: number | null,"interval_months"?: number | null,"last_done_mileage"?: number | null,"last_done_on"?: string | null,"title": string,"updated_at"?: string,"user_id"?: string,"vehicle_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"due_soon_days"?: number,"due_soon_miles"?: number,"id"?: string,"interval_miles"?: number | null,"interval_months"?: number | null,"last_done_mileage"?: number | null,"last_done_on"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_vehicle_id_user_id_fkey"
      columns: ["vehicle_id","user_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "archived_at": string | null,"cover_photo_path": string | null,"created_at": string,"current_mileage": number,"engine": string | null,"id": string,"make": string,"model": string,"notes": string | null,"purchase_date": string | null,"trim": string | null,"updated_at": string,"user_id": string,"vin": string | null,"year": number | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"cover_photo_path"?: string | null,"created_at"?: string,"current_mileage"?: number,"engine"?: string | null,"id"?: string,"make": string,"model": string,"notes"?: string | null,"purchase_date"?: string | null,"trim"?: string | null,"updated_at"?: string,"user_id"?: string,"vin"?: string | null,"year"?: number | null
                  }
                  Update: {
                    "archived_at"?: string | null,"cover_photo_path"?: string | null,"created_at"?: string,"current_mileage"?: number,"engine"?: string | null,"id"?: string,"make"?: string,"model"?: string,"notes"?: string | null,"purchase_date"?: string | null,"trim"?: string | null,"updated_at"?: string,"user_id"?: string,"vin"?: string | null,"year"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "reminder_status": {
                  Row: {
                    "active": boolean | null,"created_at": string | null,"current_mileage": number | null,"days_remaining": number | null,"due_soon_days": number | null,"due_soon_miles": number | null,"id": string | null,"interval_miles": number | null,"interval_months": number | null,"last_done_mileage": number | null,"last_done_on": string | null,"miles_remaining": number | null,"next_due_mileage": number | null,"next_due_on": string | null,"status": string | null,"title": string | null,"updated_at": string | null,"user_id": string | null,"vehicle_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_vehicle_id_user_id_fkey"
      columns: ["vehicle_id","user_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Functions: {
            "save_job":
{ Args: { "job": Json,"parts"?: Json,"videos"?: Json }; Returns: string
                           }
          }
          Enums: {
            "job_type": "maintenance"|"upgrade"|"repair"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "job_type": ["maintenance", "upgrade", "repair"]
          }
        }
} as const
