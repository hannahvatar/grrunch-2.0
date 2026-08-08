// Generated via `supabase gen types typescript --linked` -- regenerate this
// (not hand-edit it) whenever the schema changes. See supabase/migrations/
// for the actual source of truth.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      curated_deals: {
        Row: {
          airtable_record_id: string | null
          category: string | null
          chain_name: string
          created_at: string
          discount_pct: number | null
          flyer_valid_from: string
          flyer_valid_to: string
          id: string
          image_url: string | null
          item_name: string
          original_price: number
          price: number
          product_url: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["deal_status"]
        }
        Insert: {
          airtable_record_id?: string | null
          category?: string | null
          chain_name: string
          created_at?: string
          discount_pct?: number | null
          flyer_valid_from: string
          flyer_valid_to: string
          id?: string
          image_url?: string | null
          item_name: string
          original_price: number
          price: number
          product_url: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
        }
        Update: {
          airtable_record_id?: string | null
          category?: string | null
          chain_name?: string
          created_at?: string
          discount_pct?: number | null
          flyer_valid_from?: string
          flyer_valid_to?: string
          id?: string
          image_url?: string | null
          item_name?: string
          original_price?: number
          price?: number
          product_url?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
        }
        Relationships: []
      }
      deal_item_nutrition_reference: {
        Row: {
          barcode: string | null
          basis: string
          brand: string | null
          calories_per_100g: number
          id: string
          item_name: string
          last_synced_at: string
          package_grams: number | null
          package_grams_source: string | null
          protein_per_100g: number
          reviewed_by: string | null
          source: string
        }
        Insert: {
          barcode?: string | null
          basis?: string
          brand?: string | null
          calories_per_100g: number
          id?: string
          item_name: string
          last_synced_at?: string
          package_grams?: number | null
          package_grams_source?: string | null
          protein_per_100g: number
          reviewed_by?: string | null
          source: string
        }
        Update: {
          barcode?: string | null
          basis?: string
          brand?: string | null
          calories_per_100g?: number
          id?: string
          item_name?: string
          last_synced_at?: string
          package_grams?: number | null
          package_grams_source?: string | null
          protein_per_100g?: number
          reviewed_by?: string | null
          source?: string
        }
        Relationships: []
      }
      produce_reference_prices: {
        Row: {
          airtable_record_id: string | null
          avg_price: number
          geography: string
          id: string
          ingredient_name: string
          last_synced_at: string
          reference_date: string
          source: string
          unit: string
        }
        Insert: {
          airtable_record_id?: string | null
          avg_price: number
          geography?: string
          id?: string
          ingredient_name: string
          last_synced_at?: string
          reference_date: string
          source?: string
          unit: string
        }
        Update: {
          airtable_record_id?: string | null
          avg_price?: number
          geography?: string
          id?: string
          ingredient_name?: string
          last_synced_at?: string
          reference_date?: string
          source?: string
          unit?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          calories: number | null
          created_at: string
          deal_tags: Json | null
          id: string
          ingredients: Json
          instructions: Json
          minutes: number | null
          name: string
          price: number | null
          protein: number | null
          servings: number
          source: Database["public"]["Enums"]["recipe_source"]
          source_deal_ids: string[] | null
        }
        Insert: {
          calories?: number | null
          created_at?: string
          deal_tags?: Json | null
          id?: string
          ingredients: Json
          instructions: Json
          minutes?: number | null
          name: string
          price?: number | null
          protein?: number | null
          servings?: number
          source?: Database["public"]["Enums"]["recipe_source"]
          source_deal_ids?: string[] | null
        }
        Update: {
          calories?: number | null
          created_at?: string
          deal_tags?: Json | null
          id?: string
          ingredients?: Json
          instructions?: Json
          minutes?: number | null
          name?: string
          price?: number | null
          protein?: number | null
          servings?: number
          source?: Database["public"]["Enums"]["recipe_source"]
          source_deal_ids?: string[] | null
        }
        Relationships: []
      }
      saved_recipes: {
        Row: {
          calories: number | null
          id: string
          ingredients: Json
          macros: Json | null
          name: string
          saved_at: string
          user_id: string
        }
        Insert: {
          calories?: number | null
          id?: string
          ingredients: Json
          macros?: Json | null
          name: string
          saved_at?: string
          user_id: string
        }
        Update: {
          calories?: number | null
          id?: string
          ingredients?: Json
          macros?: Json | null
          name?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staple_cooked_yield: {
        Row: {
          cooked_per_dry_ratio: number
          id: string
          ingredient_name: string
        }
        Insert: {
          cooked_per_dry_ratio: number
          id?: string
          ingredient_name: string
        }
        Update: {
          cooked_per_dry_ratio?: number
          id?: string
          ingredient_name?: string
        }
        Relationships: []
      }
      staple_densities: {
        Row: {
          grams_per_cup: number
          id: string
          ingredient_name: string
        }
        Insert: {
          grams_per_cup: number
          id?: string
          ingredient_name: string
        }
        Update: {
          grams_per_cup?: number
          id?: string
          ingredient_name?: string
        }
        Relationships: []
      }
      staple_reference_prices: {
        Row: {
          airtable_record_id: string | null
          avg_price: number
          calories_per_100g: number | null
          checked_by: string | null
          id: string
          ingredient_name: string
          last_checked_at: string
          nutrition_reviewed_by: string | null
          nutrition_source: string | null
          protein_per_100g: number | null
          unit: string
        }
        Insert: {
          airtable_record_id?: string | null
          avg_price: number
          calories_per_100g?: number | null
          checked_by?: string | null
          id?: string
          ingredient_name: string
          last_checked_at?: string
          nutrition_reviewed_by?: string | null
          nutrition_source?: string | null
          protein_per_100g?: number | null
          unit: string
        }
        Update: {
          airtable_record_id?: string | null
          avg_price?: number
          calories_per_100g?: number | null
          checked_by?: string | null
          id?: string
          ingredient_name?: string
          last_checked_at?: string
          nutrition_reviewed_by?: string | null
          nutrition_source?: string | null
          protein_per_100g?: number | null
          unit?: string
        }
        Relationships: []
      }
      statcan_reference_prices: {
        Row: {
          avg_price: number
          calories_per_100g: number | null
          geography: string
          id: string
          ingredient_name: string
          last_synced_at: string
          nutrition_reviewed_by: string | null
          nutrition_source: string | null
          product_name: string
          protein_per_100g: number | null
          reference_month: string
          source: string
          unit: string
        }
        Insert: {
          avg_price: number
          calories_per_100g?: number | null
          geography?: string
          id?: string
          ingredient_name: string
          last_synced_at?: string
          nutrition_reviewed_by?: string | null
          nutrition_source?: string | null
          product_name: string
          protein_per_100g?: number | null
          reference_month: string
          source?: string
          unit: string
        }
        Update: {
          avg_price?: number
          calories_per_100g?: number | null
          geography?: string
          id?: string
          ingredient_name?: string
          last_synced_at?: string
          nutrition_reviewed_by?: string | null
          nutrition_source?: string | null
          product_name?: string
          protein_per_100g?: number | null
          reference_month?: string
          source?: string
          unit?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string
          banner: string | null
          chain_name: string
          created_at: string
          google_place_id: string | null
          hours: Json | null
          id: string
          lat: number | null
          lng: number | null
        }
        Insert: {
          address: string
          banner?: string | null
          chain_name: string
          created_at?: string
          google_place_id?: string | null
          hours?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
        }
        Update: {
          address?: string
          banner?: string | null
          chain_name?: string
          created_at?: string
          google_place_id?: string | null
          hours?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          status: string
          trial_ends_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          status?: string
          trial_ends_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          status?: string
          trial_ends_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          agreed_to_terms_at: string | null
          created_at: string
          email: string | null
          id: string
          notification_prefs: Json
          terms_version: string | null
        }
        Insert: {
          agreed_to_terms_at?: string | null
          created_at?: string
          email?: string | null
          id: string
          notification_prefs?: Json
          terms_version?: string | null
        }
        Update: {
          agreed_to_terms_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          notification_prefs?: Json
          terms_version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      normalize_words: { Args: { txt: string }; Returns: string[] }
      parse_unit_amount: {
        Args: { quantity: string; unit_text: string }
        Returns: Database["public"]["CompositeTypes"]["unit_amount"]
        SetofOptions: {
          from: "*"
          to: "unit_amount"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reference_match_score: {
        Args: { ing_words: string[]; staple_words: string[] }
        Returns: number
      }
      refresh_recipe_deal_tags: { Args: never; Returns: undefined }
      refresh_recipe_nutrition: { Args: never; Returns: undefined }
      scale_deal_nutrient: {
        Args: {
          basis: string
          ingredient_name: string
          package_grams: number
          per_100_value: number
          recipe_quantity: string
          recipe_unit: string
        }
        Returns: number
      }
      scale_reference_price: {
        Args: {
          ingredient_name: string
          recipe_quantity: string
          recipe_unit: string
          ref_price: number
          ref_unit: string
        }
        Returns: number
      }
      staple_alias_words: { Args: { words: string[] }; Returns: string[] }
      variety_descriptors: { Args: never; Returns: string[] }
    }
    Enums: {
      deal_status: "pending" | "approved" | "rejected"
      recipe_source: "ai_generated" | "manual"
    }
    CompositeTypes: {
      unit_amount: {
        amount: number | null
        base_unit: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      deal_status: ["pending", "approved", "rejected"],
      recipe_source: ["ai_generated", "manual"],
    },
  },
} as const
