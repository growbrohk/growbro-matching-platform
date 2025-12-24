export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      booking_entitlements: {
        Row: {
          id: string
          booking_id: string
          code: string
          redeemed_at: string | null
          redeemed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          code: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          code?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_entitlements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_entitlements_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      bookings: {
        Row: {
          id: string
          brand_org_id: string
          venue_org_id: string
          resource_product_id: string
          start_at: string
          end_at: string
          status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_org_id: string
          venue_org_id: string
          resource_product_id: string
          start_at: string
          end_at: string
          status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_org_id?: string
          venue_org_id?: string
          resource_product_id?: string
          start_at?: string
          end_at?: string
          status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_brand_org_id_fkey"
            columns: ["brand_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_org_id_fkey"
            columns: ["venue_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_resource_product_id_fkey"
            columns: ["resource_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      events: {
        Row: {
          id: string
          org_id: string
          venue_org_id: string | null
          title: string
          description: string | null
          start_at: string
          end_at: string
          status: 'draft' | 'published' | 'cancelled' | 'completed'
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          venue_org_id?: string | null
          title: string
          description?: string | null
          start_at: string
          end_at: string
          status?: 'draft' | 'published' | 'cancelled' | 'completed'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          venue_org_id?: string | null
          title?: string
          description?: string | null
          start_at?: string
          end_at?: string
          status?: 'draft' | 'published' | 'cancelled' | 'completed'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_org_id_fkey"
            columns: ["venue_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          }
        ]
      }
      inventory_items: {
        Row: {
          id: string
          org_id: string
          warehouse_id: string
          variant_id: string
          quantity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          warehouse_id: string
          variant_id: string
          quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          warehouse_id?: string
          variant_id?: string
          quantity?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          }
        ]
      }
      inventory_movements: {
        Row: {
          id: string
          inventory_item_id: string
          delta: number
          reason: string
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          inventory_item_id: string
          delta: number
          reason: string
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          inventory_item_id?: string
          delta?: number
          reason?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          ticket_type_id: string
          quantity: number
          unit_price: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          ticket_type_id: string
          quantity: number
          unit_price: number
          subtotal: number
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          ticket_type_id?: string
          quantity?: number
          unit_price?: number
          subtotal?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          id: string
          event_id: string
          buyer_user_id: string
          total_amount: number
          status: 'pending' | 'paid' | 'cancelled' | 'refunded'
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          buyer_user_id: string
          total_amount: number
          status?: 'pending' | 'paid' | 'cancelled' | 'refunded'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          buyer_user_id?: string
          total_amount?: number
          status?: 'pending' | 'paid' | 'cancelled' | 'refunded'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_user_id_fkey"
            columns: ["buyer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      org_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      orgs: {
        Row: {
          id: string
          name: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          id: string
          org_id: string
          name: string
          slug: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          slug: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          slug?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          }
        ]
      }
      product_pricing: {
        Row: {
          id: string
          product_id: string
          pricing_model: 'fixed' | 'revenue_share'
          rate: number
          rate_unit: string | null
          minimum_fee: number | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          pricing_model: 'fixed' | 'revenue_share'
          rate: number
          rate_unit?: string | null
          minimum_fee?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          pricing_model?: 'fixed' | 'revenue_share'
          rate?: number
          rate_unit?: string | null
          minimum_fee?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      product_tag_links: {
        Row: {
          id: string
          product_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          tag_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tag_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tags"
            referencedColumns: ["id"]
          }
        ]
      }
      product_tags: {
        Row: {
          id: string
          org_id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          slug?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          }
        ]
      }
      product_variants: {
        Row: {
          id: string
          product_id: string
          name: string
          sku: string | null
          price: number | null
          metadata: Json
          created_at: string
          updated_at: string
          archived_at: string | null
          active: boolean
        }
        Insert: {
          id?: string
          product_id: string
          name: string
          sku?: string | null
          price?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          archived_at?: string | null
          active?: boolean
        }
        Update: {
          id?: string
          product_id?: string
          name?: string
          sku?: string | null
          price?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          archived_at?: string | null
          active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      products: {
        Row: {
          id: string
          org_id: string
          type: 'physical' | 'venue_asset'
          title: string
          description: string | null
          base_price: number | null
          metadata: Json
          created_at: string
          updated_at: string
          category_id: string | null
        }
        Insert: {
          id?: string
          org_id: string
          type: 'physical' | 'venue_asset'
          title: string
          description?: string | null
          base_price?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          category_id?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          type?: 'physical' | 'venue_asset'
          title?: string
          description?: string | null
          base_price?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          category_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      ticket_types: {
        Row: {
          id: string
          event_id: string
          name: string
          price: number
          quota: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          price: number
          quota: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          price?: number
          quota?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          }
        ]
      }
      tickets: {
        Row: {
          id: string
          order_id: string
          order_item_id: string
          ticket_type_id: string
          qr_code: string
          status: 'valid' | 'scanned' | 'cancelled'
          scanned_at: string | null
          scanned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          order_item_id: string
          ticket_type_id: string
          qr_code: string
          status?: 'valid' | 'scanned' | 'cancelled'
          scanned_at?: string | null
          scanned_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          order_item_id?: string
          ticket_type_id?: string
          qr_code?: string
          status?: 'valid' | 'scanned' | 'cancelled'
          scanned_at?: string | null
          scanned_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      warehouses: {
        Row: {
          id: string
          org_id: string
          name: string
          address: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          address?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          address?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_org: {
        Args: {
          p_name: string
        }
        Returns: string
      }
      create_product_with_variants: {
        Args: {
          p_org_id: string
          p_type: 'physical' | 'venue_asset'
          p_title: string
          p_base_price: number
          p_variant_names: string[] | null
          p_variant_skus: string[] | null
          p_variant_prices: number[] | null
        }
        Returns: string
      }
      create_inventory_for_variant: {
        Args: {
          p_org_id: string
          p_warehouse_id: string
          p_variant_id: string
          p_initial_stock: number
        }
        Returns: string
      }
      adjust_stock: {
        Args: {
          p_inventory_item_id: string
          p_delta: number
          p_reason: string
          p_note: string | null
        }
        Returns: string
      }
      generate_unique_code: {
        Args: {
          p_prefix: string
        }
        Returns: string
      }
      create_booking: {
        Args: {
          p_brand_org_id: string
          p_venue_org_id: string
          p_resource_product_id: string
          p_start_at: string
          p_end_at: string
        }
        Returns: string
      }
      redeem_booking: {
        Args: {
          p_code: string
        }
        Returns: string
      }
      create_event: {
        Args: {
          p_org_id: string
          p_venue_org_id: string | null
          p_title: string
          p_start_at: string
          p_end_at: string
          p_metadata: Json
        }
        Returns: string
      }
      create_ticket_type: {
        Args: {
          p_event_id: string
          p_name: string
          p_price: number
          p_quota: number
        }
        Returns: string
      }
      create_ticket_order: {
        Args: {
          p_event_id: string
          p_ticket_type_id: string
          p_qty: number
          p_buyer_user_id: string
        }
        Returns: string
      }
      scan_ticket: {
        Args: {
          p_qr_code: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[keyof Database & 'public']

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
        PublicSchema['Views'])
    ? (PublicSchema['Tables'] &
        PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema['Enums']
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never
