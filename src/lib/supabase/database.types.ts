// Keep these types aligned with supabase/migrations. Regenerate from Supabase
// after applying migrations to a hosted project when the CLI is configured.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          description: string;
          image_path: string;
          price_kobo: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          image_path: string;
          price_kobo: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          image_path?: string;
          price_kobo?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          user_id: string;
          product_id: string;
          quantity: number;
          revision: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          product_id: string;
          quantity: number;
          revision?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          product_id?: string;
          quantity?: number;
          revision?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          delivery_details: Json | null;
          id: string;
          user_id: string;
          customer_email: string;
          items: Json;
          total_kobo: number;
          currency: string;
          checkout_key: string;
          payment_reference: string;
          authorization_url: string | null;
          payment_status: string;
          paid_at: string | null;
          email_status: string;
          email_attempt_at: string | null;
          email_attempt_id: string | null;
          mailgun_message_id: string | null;
          created_at: string;
        };
        Insert: {
          delivery_details?: Json | null;
          id?: string;
          user_id: string;
          customer_email: string;
          items: Json;
          total_kobo: number;
          currency?: string;
          checkout_key: string;
          payment_reference: string;
          authorization_url?: string | null;
          payment_status?: string;
          paid_at?: string | null;
          email_status?: string;
          email_attempt_at?: string | null;
          email_attempt_id?: string | null;
          mailgun_message_id?: string | null;
          created_at?: string;
        };
        Update: {
          delivery_details?: Json | null;
          id?: string;
          user_id?: string;
          customer_email?: string;
          items?: Json;
          total_kobo?: number;
          currency?: string;
          checkout_key?: string;
          payment_reference?: string;
          authorization_url?: string | null;
          payment_status?: string;
          paid_at?: string | null;
          email_status?: string;
          email_attempt_at?: string | null;
          email_attempt_id?: string | null;
          mailgun_message_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_order_snapshot: {
        Args: { p_user_id: string; p_customer_email: string; p_checkout_key: string; p_delivery_details: Json };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      finalize_paid_order: {
        Args: { p_order_id: string; p_reference: string; p_amount_kobo: number; p_currency: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      claim_order_email: {
        Args: { p_order_id: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      complete_order_email: {
        Args: { p_order_id: string; p_attempt_id: string; p_status: string; p_message_id?: string | null };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
