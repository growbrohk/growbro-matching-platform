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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      collab_listings: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          city: string | null
          collab_type: Database["public"]["Enums"]["collab_type"]
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          owner_user_id: string
          target_role: Database["public"]["Enums"]["user_role"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          city?: string | null
          collab_type: Database["public"]["Enums"]["collab_type"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          owner_user_id: string
          target_role?: Database["public"]["Enums"]["user_role"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          city?: string | null
          collab_type?: Database["public"]["Enums"]["collab_type"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          owner_user_id?: string
          target_role?: Database["public"]["Enums"]["user_role"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collab_listings_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_request_products: {
        Row: {
          collab_request_id: string
          created_at: string | null
          id: string
          note: string | null
          product_id: string
        }
        Insert: {
          collab_request_id: string
          created_at?: string | null
          id?: string
          note?: string | null
          product_id: string
        }
        Update: {
          collab_request_id?: string
          created_at?: string | null
          id?: string
          note?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_request_products_collab_request_id_fkey"
            columns: ["collab_request_id"]
            isOneToOne: false
            referencedRelation: "collab_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_request_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_request_venue_options: {
        Row: {
          collab_request_id: string
          created_at: string | null
          id: string
          note: string | null
          venue_collab_option_id: string
        }
        Insert: {
          collab_request_id: string
          created_at?: string | null
          id?: string
          note?: string | null
          venue_collab_option_id: string
        }
        Update: {
          collab_request_id?: string
          created_at?: string | null
          id?: string
          note?: string | null
          venue_collab_option_id?: string
        }
        Relationships: []
      }
      collab_requests: {
        Row: {
          budget_notes: string | null
          collab_listing_id: string | null
          collab_type: Database["public"]["Enums"]["collab_type"]
          created_at: string | null
          from_user_id: string
          id: string
          location_notes: string | null
          message: string | null
          proposed_end_date: string | null
          proposed_start_date: string | null
          status: Database["public"]["Enums"]["collab_status"] | null
          to_user_id: string
          updated_at: string | null
        }
        Insert: {
          budget_notes?: string | null
          collab_listing_id?: string | null
          collab_type: Database["public"]["Enums"]["collab_type"]
          created_at?: string | null
          from_user_id: string
          id?: string
          location_notes?: string | null
          message?: string | null
          proposed_end_date?: string | null
          proposed_start_date?: string | null
          status?: Database["public"]["Enums"]["collab_status"] | null
          to_user_id: string
          updated_at?: string | null
        }
        Update: {
          budget_notes?: string | null
          collab_listing_id?: string | null
          collab_type?: Database["public"]["Enums"]["collab_type"]
          created_at?: string | null
          from_user_id?: string
          id?: string
          location_notes?: string | null
          message?: string | null
          proposed_end_date?: string | null
          proposed_start_date?: string | null
          status?: Database["public"]["Enums"]["collab_status"] | null
          to_user_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collab_requests_collab_listing_id_fkey"
            columns: ["collab_listing_id"]
            isOneToOne: false
            referencedRelation: "collab_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          address_line: string | null
          area: string | null
          city: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          type: Database["public"]["Enums"]["inventory_location_type"]
          updated_at: string | null
          venue_user_id: string | null
        }
        Insert: {
          address_line?: string | null
          area?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type: Database["public"]["Enums"]["inventory_location_type"]
          updated_at?: string | null
          venue_user_id?: string | null
        }
        Update: {
          address_line?: string | null
          area?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: Database["public"]["Enums"]["inventory_location_type"]
          updated_at?: string | null
          venue_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_venue_user_id_fkey"
            columns: ["venue_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          is_like: boolean
          to_user_id: string
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id?: string
          is_like: boolean
          to_user_id: string
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          is_like?: boolean
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string | null
          id: string
          user_one_id: string
          user_two_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_one_id: string
          user_two_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_one_id?: string
          user_two_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_user_one_id_fkey"
            columns: ["user_one_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_two_id_fkey"
            columns: ["user_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          collab_request_id: string | null
          created_at: string | null
          id: string
          match_id: string | null
          sender_user_id: string
        }
        Insert: {
          body: string
          collab_request_id?: string | null
          created_at?: string | null
          id?: string
          match_id?: string | null
          sender_user_id: string
        }
        Update: {
          body?: string
          collab_request_id?: string | null
          created_at?: string | null
          id?: string
          match_id?: string | null
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_collab_request_id_fkey"
            columns: ["collab_request_id"]
            isOneToOne: false
            referencedRelation: "collab_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          inventory_location_id: string | null
          order_id: string
          product_id: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_location_id?: string | null
          order_id: string
          product_id: string
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_location_id?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_email: string
          customer_name: string | null
          id: string
          status: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_amount_cents: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          customer_email: string
          customer_name?: string | null
          id?: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_amount_cents: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          customer_email?: string
          customer_name?: string | null
          id?: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_amount_cents?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      product_inventory: {
        Row: {
          created_at: string | null
          id: string
          inventory_location_id: string
          product_id: string
          reserved_quantity: number | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_location_id: string
          product_id: string
          reserved_quantity?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_location_id?: string
          product_id?: string
          reserved_quantity?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_inventory_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_user_id: string
          category: string | null
          created_at: string | null
          currency: string | null
          full_description: string | null
          id: string
          inventory_notes: string | null
          is_active: boolean | null
          is_public: boolean | null
          is_purchasable: boolean | null
          margin_notes: string | null
          name: string
          price_in_cents: number | null
          price_range_max: number | null
          price_range_min: number | null
          short_description: string | null
          slug: string | null
          suitable_collab_types:
            | Database["public"]["Enums"]["collab_type"][]
            | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          brand_user_id: string
          category?: string | null
          created_at?: string | null
          currency?: string | null
          full_description?: string | null
          id?: string
          inventory_notes?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          is_purchasable?: boolean | null
          margin_notes?: string | null
          name: string
          price_in_cents?: number | null
          price_range_max?: number | null
          price_range_min?: number | null
          short_description?: string | null
          slug?: string | null
          suitable_collab_types?:
            | Database["public"]["Enums"]["collab_type"][]
            | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          brand_user_id?: string
          category?: string | null
          created_at?: string | null
          currency?: string | null
          full_description?: string | null
          id?: string
          inventory_notes?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          is_purchasable?: boolean | null
          margin_notes?: string | null
          name?: string
          price_in_cents?: number | null
          price_range_max?: number | null
          price_range_min?: number | null
          short_description?: string | null
          slug?: string | null
          suitable_collab_types?:
            | Database["public"]["Enums"]["collab_type"][]
            | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_user_id_fkey"
            columns: ["brand_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          cover_image_url: string | null
          created_at: string | null
          display_name: string
          handle: string
          id: string
          instagram_handle: string | null
          preferred_collab_types:
            | Database["public"]["Enums"]["collab_type"][]
            | null
          role: Database["public"]["Enums"]["user_role"]
          short_bio: string | null
          tags: string[] | null
          typical_budget_max: number | null
          typical_budget_min: number | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          display_name: string
          handle: string
          id: string
          instagram_handle?: string | null
          preferred_collab_types?:
            | Database["public"]["Enums"]["collab_type"][]
            | null
          role: Database["public"]["Enums"]["user_role"]
          short_bio?: string | null
          tags?: string[] | null
          typical_budget_max?: number | null
          typical_budget_min?: number | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          display_name?: string
          handle?: string
          id?: string
          instagram_handle?: string | null
          preferred_collab_types?:
            | Database["public"]["Enums"]["collab_type"][]
            | null
          role?: Database["public"]["Enums"]["user_role"]
          short_bio?: string | null
          tags?: string[] | null
          typical_budget_max?: number | null
          typical_budget_min?: number | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      venue_collab_options: {
        Row: {
          available_from: string | null
          available_to: string | null
          capacity_note: string | null
          collab_types: Database["public"]["Enums"]["collab_type"][] | null
          created_at: string | null
          full_description: string | null
          id: string
          is_active: boolean | null
          location_note: string | null
          name: string
          pricing_note: string | null
          recurring_pattern: string | null
          short_description: string | null
          type: Database["public"]["Enums"]["venue_option_type"]
          updated_at: string | null
          venue_user_id: string
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          capacity_note?: string | null
          collab_types?: Database["public"]["Enums"]["collab_type"][] | null
          created_at?: string | null
          full_description?: string | null
          id?: string
          is_active?: boolean | null
          location_note?: string | null
          name: string
          pricing_note?: string | null
          recurring_pattern?: string | null
          short_description?: string | null
          type: Database["public"]["Enums"]["venue_option_type"]
          updated_at?: string | null
          venue_user_id: string
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          capacity_note?: string | null
          collab_types?: Database["public"]["Enums"]["collab_type"][] | null
          created_at?: string | null
          full_description?: string | null
          id?: string
          is_active?: boolean | null
          location_note?: string | null
          name?: string
          pricing_note?: string | null
          recurring_pattern?: string | null
          short_description?: string | null
          type?: Database["public"]["Enums"]["venue_option_type"]
          updated_at?: string | null
          venue_user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      collab_status: "pending" | "accepted" | "declined" | "closed"
      collab_type:
        | "consignment"
        | "event"
        | "collab_product"
        | "cup_sleeve_marketing"
      inventory_location_type: "warehouse" | "venue"
      user_role: "brand" | "venue"
      venue_option_type:
        | "event_slot"
        | "shelf_space"
        | "exhibition_period"
        | "wall_space"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
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
  public: {
    Enums: {
      collab_status: ["pending", "accepted", "declined", "closed"],
      collab_type: [
        "consignment",
        "event",
        "collab_product",
        "cup_sleeve_marketing",
      ],
      inventory_location_type: ["warehouse", "venue"],
      user_role: ["brand", "venue"],
      venue_option_type: [
        "event_slot",
        "shelf_space",
        "exhibition_period",
        "wall_space",
        "other",
      ],
    },
  },
} as const
