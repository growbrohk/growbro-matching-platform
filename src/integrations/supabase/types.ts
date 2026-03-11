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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      booking_entitlements: {
        Row: {
          booking_id: string
          code: string
          created_at: string
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          booking_id: string
          code: string
          created_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          booking_id?: string
          code?: string
          created_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_entitlements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          brand_org_id: string
          created_at: string
          end_at: string
          id: string
          metadata: Json | null
          resource_product_id: string
          start_at: string
          status: string
          updated_at: string
          venue_org_id: string
        }
        Insert: {
          brand_org_id: string
          created_at?: string
          end_at: string
          id?: string
          metadata?: Json | null
          resource_product_id: string
          start_at: string
          status?: string
          updated_at?: string
          venue_org_id: string
        }
        Update: {
          brand_org_id?: string
          created_at?: string
          end_at?: string
          id?: string
          metadata?: Json | null
          resource_product_id?: string
          start_at?: string
          status?: string
          updated_at?: string
          venue_org_id?: string
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
            foreignKeyName: "bookings_resource_product_id_fkey"
            columns: ["resource_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_org_id_fkey"
            columns: ["venue_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      collabs: {
        Row: {
          brand_org_id: string
          brand_split_percent: number | null
          created_at: string
          end_at: string
          host_org_id: string
          host_split_percent: number | null
          id: string
          listing_fee_cents: number | null
          listing_id: string
          metadata: Json | null
          platform_fee_percent: number | null
          pricing_model: string
          start_at: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_org_id: string
          brand_split_percent?: number | null
          created_at?: string
          end_at: string
          host_org_id: string
          host_split_percent?: number | null
          id?: string
          listing_fee_cents?: number | null
          listing_id: string
          metadata?: Json | null
          platform_fee_percent?: number | null
          pricing_model?: string
          start_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_org_id?: string
          brand_split_percent?: number | null
          created_at?: string
          end_at?: string
          host_org_id?: string
          host_split_percent?: number | null
          id?: string
          listing_fee_cents?: number | null
          listing_id?: string
          metadata?: Json | null
          platform_fee_percent?: number | null
          pricing_model?: string
          start_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collabs_brand_org_id_fkey"
            columns: ["brand_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collabs_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collabs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "poster_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          accepted_at: string | null
          blocked_at: string | null
          blocked_by_org_id: string | null
          created_at: string
          id: string
          org_a_id: string
          org_b_id: string
          org_high_id: string
          org_low_id: string
          rejected_at: string | null
          requested_by_org_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          blocked_at?: string | null
          blocked_by_org_id?: string | null
          created_at?: string
          id?: string
          org_a_id: string
          org_b_id: string
          org_high_id: string
          org_low_id: string
          rejected_at?: string | null
          requested_by_org_id: string
          status: string
        }
        Update: {
          accepted_at?: string | null
          blocked_at?: string | null
          blocked_by_org_id?: string | null
          created_at?: string
          id?: string
          org_a_id?: string
          org_b_id?: string
          org_high_id?: string
          org_low_id?: string
          rejected_at?: string | null
          requested_by_org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_blocked_by_org_id_fkey"
            columns: ["blocked_by_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_org_a_id_fkey"
            columns: ["org_a_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_org_b_id_fkey"
            columns: ["org_b_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_org_high_id_fkey"
            columns: ["org_high_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_org_low_id_fkey"
            columns: ["org_low_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requested_by_org_id_fkey"
            columns: ["requested_by_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_org_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_org_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_sender_org_id_fkey"
            columns: ["sender_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          last_read_at: string | null
          org_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          last_read_at?: string | null
          org_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          last_read_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          order_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          order_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "host_order_cards"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          collect_attendee_info: string | null
          created_at: string
          day_2_end_at: string | null
          day_2_start_at: string | null
          description: string | null
          enable_fps: boolean | null
          enable_payme: boolean | null
          enable_stripe: boolean | null
          end_at: string
          fps_link: string | null
          id: string
          instagram_preview_image_url: string | null
          location_text: string | null
          metadata: Json | null
          org_id: string
          payme_link: string | null
          slug: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
          venue_org_id: string | null
        }
        Insert: {
          collect_attendee_info?: string | null
          created_at?: string
          day_2_end_at?: string | null
          day_2_start_at?: string | null
          description?: string | null
          enable_fps?: boolean | null
          enable_payme?: boolean | null
          enable_stripe?: boolean | null
          end_at: string
          fps_link?: string | null
          id?: string
          instagram_preview_image_url?: string | null
          location_text?: string | null
          metadata?: Json | null
          org_id: string
          payme_link?: string | null
          slug?: string | null
          start_at: string
          status?: string
          title: string
          updated_at?: string
          venue_org_id?: string | null
        }
        Update: {
          collect_attendee_info?: string | null
          created_at?: string
          day_2_end_at?: string | null
          day_2_start_at?: string | null
          description?: string | null
          enable_fps?: boolean | null
          enable_payme?: boolean | null
          enable_stripe?: boolean | null
          end_at?: string
          fps_link?: string | null
          id?: string
          instagram_preview_image_url?: string | null
          location_text?: string | null
          metadata?: Json | null
          org_id?: string
          payme_link?: string | null
          slug?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
          venue_org_id?: string | null
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
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          org_id: string
          quantity: number
          updated_at: string
          variant_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          quantity?: number
          updated_at?: string
          variant_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
          warehouse_id?: string
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
            foreignKeyName: "inventory_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          inventory_item_id: string
          note: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          inventory_item_id: string
          note?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          inventory_item_id?: string
          note?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          sender_org_id: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_org_id?: string | null
          sender_type: string
          sender_user_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_org_id?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_org_id_fkey"
            columns: ["sender_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          subtotal: number
          ticket_type_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          subtotal: number
          ticket_type_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          subtotal?: number
          ticket_type_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "host_order_cards"
            referencedColumns: ["order_id"]
          },
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
          },
        ]
      }
      orders: {
        Row: {
          buyer_email: string | null
          buyer_first_name: string | null
          buyer_last_name: string | null
          buyer_phone: string | null
          buyer_user_id: string | null
          confirmation_email_attempts: number | null
          confirmation_email_error: string | null
          confirmation_email_resend_id: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_trigger_log: Json | null
          confirmed_at: string | null
          created_at: string
          currency: string | null
          event_id: string | null
          fulfillment_status: string | null
          id: string
          metadata: Json | null
          order_no: string | null
          order_type: string
          paid_at: string | null
          payment_method: string | null
          payment_reference_link: string | null
          payment_status: string | null
          receipt_url: string | null
          status: string
          submitted_at: string | null
          total_amount: number
          tracking_link_id: string | null
          updated_at: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_first_name?: string | null
          buyer_last_name?: string | null
          buyer_phone?: string | null
          buyer_user_id?: string | null
          confirmation_email_attempts?: number | null
          confirmation_email_error?: string | null
          confirmation_email_resend_id?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_trigger_log?: Json | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string | null
          event_id?: string | null
          fulfillment_status?: string | null
          id?: string
          metadata?: Json | null
          order_no?: string | null
          order_type?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference_link?: string | null
          payment_status?: string | null
          receipt_url?: string | null
          status?: string
          submitted_at?: string | null
          total_amount: number
          tracking_link_id?: string | null
          updated_at?: string
        }
        Update: {
          buyer_email?: string | null
          buyer_first_name?: string | null
          buyer_last_name?: string | null
          buyer_phone?: string | null
          buyer_user_id?: string | null
          confirmation_email_attempts?: number | null
          confirmation_email_error?: string | null
          confirmation_email_resend_id?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_trigger_log?: Json | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string | null
          event_id?: string | null
          fulfillment_status?: string | null
          id?: string
          metadata?: Json | null
          order_no?: string | null
          order_type?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference_link?: string | null
          payment_status?: string | null
          receipt_url?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number
          tracking_link_id?: string | null
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
            foreignKeyName: "orders_tracking_link_id_fkey"
            columns: ["tracking_link_id"]
            isOneToOne: false
            referencedRelation: "tracking_links"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_profiles: {
        Row: {
          address: string
          bio: string | null
          category: string
          created_at: string
          instagram: string | null
          logo_url: string | null
          org_id: string
          roles: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address: string
          bio?: string | null
          category: string
          created_at?: string
          instagram?: string | null
          logo_url?: string | null
          org_id: string
          roles?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string
          bio?: string | null
          category?: string
          created_at?: string
          instagram?: string | null
          logo_url?: string | null
          org_id?: string
          roles?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_variant_config: {
        Row: {
          created_at: string
          org_id: string
          rank1: string
          rank2: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          org_id: string
          rank1?: string
          rank2?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          org_id?: string
          rank1?: string
          rank2?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_variant_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      poster_space_booking_requests: {
        Row: {
          computed_end_date: string
          created_at: string
          duration_units: number
          host_seen_at: string | null
          id: string
          message: string | null
          poster_space_id: string
          requested_start_date: string
          requester_email: string | null
          requester_name: string | null
          requester_user_id: string | null
          status: string
        }
        Insert: {
          computed_end_date: string
          created_at?: string
          duration_units: number
          host_seen_at?: string | null
          id?: string
          message?: string | null
          poster_space_id: string
          requested_start_date: string
          requester_email?: string | null
          requester_name?: string | null
          requester_user_id?: string | null
          status?: string
        }
        Update: {
          computed_end_date?: string
          created_at?: string
          duration_units?: number
          host_seen_at?: string | null
          id?: string
          message?: string | null
          poster_space_id?: string
          requested_start_date?: string
          requester_email?: string | null
          requester_name?: string | null
          requester_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_space_booking_requests_poster_space_id_fkey"
            columns: ["poster_space_id"]
            isOneToOne: false
            referencedRelation: "poster_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      poster_spaces: {
        Row: {
          allowed_durations: number[] | null
          approval_flow: string
          blackout_ranges: Json | null
          booking_unit: string
          bullets: string[] | null
          category: string
          created_at: string
          currency: string
          default_host_split_percent: number
          id: string
          kind: string
          listing_fee_cents: number
          org_id: string
          photos: string[] | null
          price_cents: number | null
          short_code: string
          short_description: string | null
          status: string
          subtype: string | null
          title: string
          tracking_enabled: boolean
          tracking_prefix: string | null
          updated_at: string
        }
        Insert: {
          allowed_durations?: number[] | null
          approval_flow?: string
          blackout_ranges?: Json | null
          booking_unit?: string
          bullets?: string[] | null
          category?: string
          created_at?: string
          currency?: string
          default_host_split_percent?: number
          id?: string
          kind?: string
          listing_fee_cents?: number
          org_id: string
          photos?: string[] | null
          price_cents?: number | null
          short_code: string
          short_description?: string | null
          status?: string
          subtype?: string | null
          title: string
          tracking_enabled?: boolean
          tracking_prefix?: string | null
          updated_at?: string
        }
        Update: {
          allowed_durations?: number[] | null
          approval_flow?: string
          blackout_ranges?: Json | null
          booking_unit?: string
          bullets?: string[] | null
          category?: string
          created_at?: string
          currency?: string
          default_host_split_percent?: number
          id?: string
          kind?: string
          listing_fee_cents?: number
          org_id?: string
          photos?: string[] | null
          price_cents?: number | null
          short_code?: string
          short_description?: string | null
          status?: string
          subtype?: string | null
          title?: string
          tracking_enabled?: boolean
          tracking_prefix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_spaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pricing: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          minimum_fee: number | null
          pricing_model: string
          product_id: string
          rate: number
          rate_unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          minimum_fee?: number | null
          pricing_model: string
          product_id: string
          rate: number
          rate_unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          minimum_fee?: number | null
          pricing_model?: string
          product_id?: string
          rate?: number
          rate_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tag_links: {
        Row: {
          created_at: string
          id: string
          product_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          tag_id?: string
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
          },
        ]
      }
      product_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          archived_at: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          price: number | null
          product_id: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          price?: number | null
          product_id: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          price?: number | null
          product_id?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          org_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          base_price?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          base_price?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          access_code: string | null
          allowed_affiliates: string[] | null
          availability_mode: string
          available_end_at: string | null
          available_start_at: string | null
          created_at: string
          event_id: string
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          price: number
          quota: number
          updated_at: string
          valid_for_days: string
          visibility_mode: string
        }
        Insert: {
          access_code?: string | null
          allowed_affiliates?: string[] | null
          availability_mode?: string
          available_end_at?: string | null
          available_start_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          price: number
          quota: number
          updated_at?: string
          valid_for_days?: string
          visibility_mode?: string
        }
        Update: {
          access_code?: string | null
          allowed_affiliates?: string[] | null
          availability_mode?: string
          available_end_at?: string | null
          available_start_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          price?: number
          quota?: number
          updated_at?: string
          valid_for_days?: string
          visibility_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          order_id: string
          order_item_id: string
          phone: string | null
          qr_code: string
          scanned_at: string | null
          scanned_by: string | null
          status: string
          ticket_type_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          order_id: string
          order_item_id: string
          phone?: string | null
          qr_code: string
          scanned_at?: string | null
          scanned_by?: string | null
          status?: string
          ticket_type_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          order_id?: string
          order_item_id?: string
          phone?: string | null
          qr_code?: string
          scanned_at?: string | null
          scanned_by?: string | null
          status?: string
          ticket_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "host_order_cards"
            referencedColumns: ["order_id"]
          },
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
        ]
      }
      tracking_campaigns: {
        Row: {
          collab_id: string
          created_at: string
          destination_id: string | null
          destination_type: string
          destination_url: string | null
          id: string
          scan_count: number
          short_code: string
        }
        Insert: {
          collab_id: string
          created_at?: string
          destination_id?: string | null
          destination_type: string
          destination_url?: string | null
          id?: string
          scan_count?: number
          short_code: string
        }
        Update: {
          collab_id?: string
          created_at?: string
          destination_id?: string | null
          destination_type?: string
          destination_url?: string | null
          id?: string
          scan_count?: number
          short_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_campaigns_collab_id_fkey"
            columns: ["collab_id"]
            isOneToOne: true
            referencedRelation: "collabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_clicks: {
        Row: {
          clicked_at: string
          id: string
          referrer: string | null
          tracking_link_id: string
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          referrer?: string | null
          tracking_link_id: string
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          referrer?: string | null
          tracking_link_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_clicks_tracking_link_id_fkey"
            columns: ["tracking_link_id"]
            isOneToOne: false
            referencedRelation: "tracking_links"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_links: {
        Row: {
          affiliate_org_id: string | null
          commission_rate: number | null
          created_at: string
          destination_type: string
          destination_url: string
          end_date: string | null
          host_org_id: string
          id: string
          label: string | null
          slug: string
          start_date: string | null
          status: string
          type: string
        }
        Insert: {
          affiliate_org_id?: string | null
          commission_rate?: number | null
          created_at?: string
          destination_type?: string
          destination_url: string
          end_date?: string | null
          host_org_id: string
          id?: string
          label?: string | null
          slug: string
          start_date?: string | null
          status?: string
          type?: string
        }
        Update: {
          affiliate_org_id?: string | null
          commission_rate?: number | null
          created_at?: string
          destination_type?: string
          destination_url?: string
          end_date?: string | null
          host_org_id?: string
          id?: string
          label?: string | null
          slug?: string
          start_date?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_links_affiliate_org_id_fkey"
            columns: ["affiliate_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_links_host_org_id_fkey"
            columns: ["host_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      type_definitions: {
        Row: {
          active: boolean
          created_at: string
          db_column: string | null
          db_table: string | null
          db_values: string[]
          domain: string
          id: string
          label: string
          parent_domain: string | null
          parent_value: string | null
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          db_column?: string | null
          db_table?: string | null
          db_values?: string[]
          domain: string
          id?: string
          label: string
          parent_domain?: string | null
          parent_value?: string | null
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          db_column?: string | null
          db_table?: string | null
          db_values?: string[]
          domain?: string
          id?: string
          label?: string
          parent_domain?: string | null
          parent_value?: string | null
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      host_order_cards: {
        Row: {
          buyer_first_name: string | null
          buyer_last_name: string | null
          buyer_phone: string | null
          confirmed_at: string | null
          currency: string | null
          event_cover_image_url: string | null
          event_id: string | null
          event_location_text: string | null
          event_start_at: string | null
          event_title: string | null
          fulfillment_status: string | null
          metadata: Json | null
          order_id: string | null
          order_no: string | null
          org_id: string | null
          payment_method: string | null
          receipt_url: string | null
          tickets_count: number | null
          total_amount: number | null
          updated_at: string | null
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
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_delta: number
          p_inventory_item_id: string
          p_note?: string
          p_reason: string
        }
        Returns: string
      }
      create_booking: {
        Args: {
          p_brand_org_id: string
          p_end_at: string
          p_resource_product_id: string
          p_start_at: string
          p_venue_org_id: string
        }
        Returns: string
      }
      create_event: {
        Args: {
          p_end_at: string
          p_metadata?: Json
          p_org_id: string
          p_start_at: string
          p_title: string
          p_venue_org_id: string
        }
        Returns: string
      }
      create_event_booking: {
        Args: {
          p_attendees?: Json
          p_buyer_email?: string
          p_buyer_first_name?: string
          p_buyer_last_name?: string
          p_buyer_phone?: string
          p_buyer_user_id?: string
          p_currency?: string
          p_event_id: string
          p_order_lines: Json
          p_tracking_link_id?: string
        }
        Returns: string
      }
      create_inventory_for_variant: {
        Args: {
          p_initial_stock: number
          p_org_id: string
          p_variant_id: string
          p_warehouse_id: string
        }
        Returns: string
      }
      create_org: { Args: { p_name: string }; Returns: string }
      create_product_with_variants: {
        Args: {
          p_base_price: number
          p_org_id: string
          p_title: string
          p_type: string
          p_variant_names?: string[]
          p_variant_prices?: number[]
          p_variant_skus?: string[]
        }
        Returns: string
      }
      create_ticket_order: {
        Args: {
          p_buyer_user_id: string
          p_event_id: string
          p_qty: number
          p_ticket_type_id: string
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
      derive_category_from_kind_subtype: {
        Args: { p_kind: string; p_subtype: string }
        Returns: string
      }
      generate_booking_qr_token: { Args: never; Returns: string }
      generate_event_slug: {
        Args: { p_org_id: string; p_title: string }
        Returns: string
      }
      generate_org_slug: { Args: { org_name: string }; Returns: string }
      generate_tracking_short_code: { Args: never; Returns: string }
      generate_tracking_slug: { Args: { base_text?: string }; Returns: string }
      generate_unique_code: { Args: { p_prefix?: string }; Returns: string }
      get_category_product_count: {
        Args: { category_id_param: string }
        Returns: number
      }
      get_connected_count: { Args: { p_org_id: string }; Returns: number }
      get_connected_count_public: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_connected_orgs: {
        Args: { p_org_id: string }
        Returns: {
          accepted_at: string
          avatar_url: string
          category: string
          handle: string
          name: string
          org_id: string
        }[]
      }
      get_connected_orgs_public: {
        Args: { p_org_id: string }
        Returns: {
          accepted_at: string
          avatar_url: string
          category: string
          handle: string
          name: string
          org_id: string
        }[]
      }
      get_connection_status: {
        Args: { p_my_org_id: string; p_target_org_id: string }
        Returns: {
          connection_id: string
          requested_by_org_id: string
          status: string
        }[]
      }
      get_conversation_inbox: {
        Args: { p_org_id: string }
        Returns: {
          conversation_id: string
          last_message_at: string
          last_message_body: string
          other_org_id: string
          other_org_logo_url: string
          other_org_name: string
          unread_count: number
        }[]
      }
      get_or_create_conversation: {
        Args: { p_org_a: string; p_org_b: string }
        Returns: string
      }
      get_or_create_order_conversation: {
        Args: { p_order_id: string }
        Returns: string
      }
      get_order_with_event_and_tickets: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_pending_incoming_connections: {
        Args: { p_org_id: string }
        Returns: {
          connection_id: string
          other_org_id: string
          other_org_logo_url: string
          other_org_name: string
          other_org_slug: string
          requested_at: string
        }[]
      }
      get_tag_product_count: { Args: { tag_id_param: string }; Returns: number }
      get_unread_enquiries_count: {
        Args: { p_org_id: string }
        Returns: number
      }
      increment_tracking_scan: {
        Args: { short_code_param: string }
        Returns: Json
      }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      redeem_booking: { Args: { p_code: string }; Returns: string }
      request_connection: {
        Args: { p_requester_org_id: string; p_target_org_id: string }
        Returns: string
      }
      respond_to_connection: {
        Args: { p_action: string; p_connection_id: string }
        Returns: undefined
      }
      scan_ticket: { Args: { p_qr_code: string }; Returns: string }
      slugify: { Args: { text: string }; Returns: string }
      submit_payment_receipt: {
        Args: {
          p_order_id: string
          p_payment_method: string
          p_payment_reference_link?: string
          p_receipt_url: string
        }
        Returns: undefined
      }
      update_order_contact_info: {
        Args: {
          p_buyer_email?: string
          p_buyer_first_name?: string
          p_buyer_last_name?: string
          p_buyer_phone?: string
          p_order_id: string
        }
        Returns: undefined
      }
      update_order_fulfillment: {
        Args: {
          p_confirmed_at?: string
          p_fulfillment_status: string
          p_order_id: string
        }
        Returns: boolean
      }
      user_can_access_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
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
    Enums: {},
  },
} as const
