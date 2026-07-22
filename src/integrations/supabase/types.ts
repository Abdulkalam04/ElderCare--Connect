export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          parent_id: string;
          role: string;
          created_by: string | null;
          is_urgent: boolean | null;
          response_source: string | null;
          intent: string | null;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          parent_id: string;
          role?: string;
          created_by?: string | null;
          is_urgent?: boolean | null;
          response_source?: string | null;
          intent?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          parent_id?: string;
          role?: string;
          created_by?: string | null;
          is_urgent?: boolean | null;
          response_source?: string | null;
          intent?: string | null;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          created_at: string;
          doctor_name: string;
          id: string;
          location: string | null;
          notes: string | null;
          parent_id: string;
          scheduled_at: string;
          specialty: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
          title: string;
          appointment_date: string;
          appointment_time: string | null;
          reminder_enabled: boolean;
        };
        Insert: {
          created_at?: string;
          doctor_name: string;
          id?: string;
          location?: string | null;
          notes?: string | null;
          parent_id: string;
          scheduled_at: string;
          specialty?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          title: string;
          appointment_date: string;
          appointment_time?: string | null;
          reminder_enabled?: boolean;
        };
        Update: {
          created_at?: string;
          doctor_name?: string;
          id?: string;
          location?: string | null;
          notes?: string | null;
          parent_id?: string;
          scheduled_at?: string;
          specialty?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          title?: string;
          appointment_date?: string;
          appointment_time?: string | null;
          reminder_enabled?: boolean;
        };
        Relationships: [];
      };
      caregiver_bookings: {
        Row: {
          assigned_at: string | null;
          booking_date: string | null;
          booking_time: string | null;
          cancelled_at: string | null;
          caregiver_id: string | null;
          caregiver_name: string | null;
          caregiver_type: Database["public"]["Enums"]["caregiver_type"];
          completed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          duration_hours: number;
          id: string;
          notes: string | null;
          parent_id: string;
          requested_by: string;
          review_comment: string | null;
          review_rating: number | null;
          reviewed_at: string | null;
          scheduled_at: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          trusted_caregiver_id: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          booking_date?: string | null;
          booking_time?: string | null;
          cancelled_at?: string | null;
          caregiver_id?: string | null;
          caregiver_name?: string | null;
          caregiver_type: Database["public"]["Enums"]["caregiver_type"];
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          duration_hours?: number;
          id?: string;
          notes?: string | null;
          parent_id: string;
          requested_by: string;
          review_comment?: string | null;
          review_rating?: number | null;
          reviewed_at?: string | null;
          scheduled_at: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          trusted_caregiver_id?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          booking_date?: string | null;
          booking_time?: string | null;
          cancelled_at?: string | null;
          caregiver_id?: string | null;
          caregiver_name?: string | null;
          caregiver_type?: Database["public"]["Enums"]["caregiver_type"];
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          duration_hours?: number;
          id?: string;
          notes?: string | null;
          parent_id?: string;
          requested_by?: string;
          review_comment?: string | null;
          review_rating?: number | null;
          reviewed_at?: string | null;
          scheduled_at?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          trusted_caregiver_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "caregiver_bookings_trusted_caregiver_id_fkey";
            columns: ["trusted_caregiver_id"];
            isOneToOne: false;
            referencedRelation: "trusted_caregivers";
            referencedColumns: ["id"];
          },
        ];
      };
      health_records: {
        Row: {
          created_at: string;
          doctor_name: string | null;
          file_url: string | null;
          id: string;
          notes: string | null;
          parent_id: string;
          record_date: string;
          record_type: string;
          title: string;
          category: "blood_test" | "prescription" | "ecg";
          description: string | null;
          file_path: string | null;
          file_type: string | null;
          file_size: number | null;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          doctor_name?: string | null;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          parent_id: string;
          record_date?: string;
          record_type?: string;
          title: string;
          category?: "blood_test" | "prescription" | "ecg";
          description?: string | null;
          file_path?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          doctor_name?: string | null;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          parent_id?: string;
          record_date?: string;
          record_type?: string;
          title?: string;
          category?: "blood_test" | "prescription" | "ecg";
          description?: string | null;
          file_path?: string | null;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
        };
        Relationships: [];
      };
      health_risk_assessments: {
        Row: {
          activity_level: string | null;
          age: number;
          bp_diastolic: number | null;
          bp_systolic: number | null;
          created_at: string;
          heart_rate: number | null;
          id: string;
          oxygen_level: number | null;
          parent_id: string;
          recommendations: string | null;
          risk_level: Database["public"]["Enums"]["risk_level"];
          risk_score: number | null;
          sugar_level: number | null;
          summary: string | null;
          weight: number | null;
          wellness_data: string | null;
          warning_flags: string[] | null;
          urgent: boolean | null;
          generated_by: string | null;
          source_mode: string | null;
          source_vital_ids: string[] | null;
          comparison: Json | null;
        };
        Insert: {
          activity_level?: string | null;
          age: number;
          bp_diastolic?: number | null;
          bp_systolic?: number | null;
          created_at?: string;
          heart_rate?: number | null;
          id?: string;
          oxygen_level?: number | null;
          parent_id: string;
          recommendations?: string | null;
          risk_level?: Database["public"]["Enums"]["risk_level"];
          risk_score?: number | null;
          sugar_level?: number | null;
          summary?: string | null;
          weight?: number | null;
          wellness_data?: string | null;
          warning_flags?: string[] | null;
          urgent?: boolean | null;
          generated_by?: string | null;
          source_mode?: string | null;
          source_vital_ids?: string[] | null;
          comparison?: Json | null;
        };
        Update: {
          activity_level?: string | null;
          age?: number;
          bp_diastolic?: number | null;
          bp_systolic?: number | null;
          created_at?: string;
          heart_rate?: number | null;
          id?: string;
          oxygen_level?: number | null;
          parent_id?: string;
          recommendations?: string | null;
          risk_level?: Database["public"]["Enums"]["risk_level"];
          risk_score?: number | null;
          sugar_level?: number | null;
          summary?: string | null;
          weight?: number | null;
          wellness_data?: string | null;
          warning_flags?: string[] | null;
          urgent?: boolean | null;
          generated_by?: string | null;
          source_mode?: string | null;
          source_vital_ids?: string[] | null;
          comparison?: Json | null;
        };
        Relationships: [];
      };
      medicine_logs: {
        Row: {
          created_at: string;
          id: string;
          log_date: string;
          medicine_id: string;
          parent_id: string;
          taken_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          log_date?: string;
          medicine_id: string;
          parent_id: string;
          taken_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          log_date?: string;
          medicine_id?: string;
          parent_id?: string;
          taken_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medicine_logs_medicine_id_fkey";
            columns: ["medicine_id"];
            isOneToOne: false;
            referencedRelation: "medicines";
            referencedColumns: ["id"];
          },
        ];
      };
      medicines: {
        Row: {
          active: boolean;
          created_at: string;
          dosage: string;
          id: string;
          name: string;
          notes: string | null;
          duration: string | null;
          parent_id: string;
          period: Database["public"]["Enums"]["med_period"];
          schedule_time: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          dosage?: string;
          id?: string;
          name: string;
          notes?: string | null;
          duration?: string | null;
          parent_id: string;
          period?: Database["public"]["Enums"]["med_period"];
          schedule_time?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          dosage?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          duration?: string | null;
          parent_id?: string;
          period?: Database["public"]["Enums"]["med_period"];
          schedule_time?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      parent_child_links: {
        Row: {
          child_id: string;
          created_at: string;
          id: string;
          parent_id: string;
        };
        Insert: {
          child_id: string;
          created_at?: string;
          id?: string;
          parent_id: string;
        };
        Update: {
          child_id?: string;
          created_at?: string;
          id?: string;
          parent_id?: string;
        };
        Relationships: [];
      };
      parent_notifications: {
        Row: {
          id: string;
          parent_id: string;
          sender_id: string;
          type: string;
          notification_type: string | null;
          message: string;
          is_read: boolean;
          metadata: Record<string, unknown> | null;
          created_at: string;
          deleted_at: string | null;
          dedup_key: string | null;
        };
        Insert: {
          id?: string;
          parent_id: string;
          sender_id: string;
          type: string;
          notification_type?: string | null;
          message: string;
          is_read?: boolean;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          deleted_at?: string | null;
          dedup_key?: string | null;
        };
        Update: {
          id?: string;
          parent_id?: string;
          sender_id?: string;
          type?: string;
          notification_type?: string | null;
          message?: string;
          is_read?: boolean;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          deleted_at?: string | null;
          dedup_key?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          address: string | null;
          avatar_url: string | null;
          created_at: string;
          date_of_birth: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          full_name: string;
          id: string;
          invite_code: string | null;
          medical_conditions: string | null;
          phone: string | null;
          last_app_activity_at: string | null;
          last_activity_source: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          email: string | null;
        };
        Insert: {
          address?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          full_name?: string;
          id: string;
          invite_code?: string | null;
          medical_conditions?: string | null;
          phone?: string | null;
          last_app_activity_at?: string | null;
          last_activity_source?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          email?: string | null;
        };
        Update: {
          address?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          full_name?: string;
          id?: string;
          invite_code?: string | null;
          medical_conditions?: string | null;
          phone?: string | null;
          last_app_activity_at?: string | null;
          last_activity_source?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          email?: string | null;
        };
        Relationships: [];
      };
      sos_alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          address: string | null;
          alert_timestamp: string;
          alert_type: string;
          created_at: string;
          dedup_key: string | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          location_updated_at: string | null;
          location_accuracy: number | null;
          live_location_enabled: boolean;
          message: string | null;
          parent_id: string;
          parent_name: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["sos_status"];
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          address?: string | null;
          alert_timestamp?: string;
          alert_type?: string;
          created_at?: string;
          dedup_key?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          location_updated_at?: string | null;
          location_accuracy?: number | null;
          live_location_enabled?: boolean;
          message?: string | null;
          parent_id: string;
          parent_name?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["sos_status"];
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          address?: string | null;
          alert_timestamp?: string;
          alert_type?: string;
          created_at?: string;
          dedup_key?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          location_updated_at?: string | null;
          location_accuracy?: number | null;
          live_location_enabled?: boolean;
          message?: string | null;
          parent_id?: string;
          parent_name?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["sos_status"];
        };
        Relationships: [];
      };
      trusted_caregivers: {
        Row: {
          address: string | null;
          available: boolean;
          available_days: number[];
          available_from: string | null;
          available_until: string | null;
          caregiver_type: "nurse" | "caretaker" | "physiotherapist" | "companion" | "other";
          created_at: string;
          email: string | null;
          experience_years: number;
          id: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          notes: string | null;
          parent_id: string;
          phone: string | null;
          qualification: string | null;
          service_area: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          available?: boolean;
          available_days?: number[];
          available_from?: string | null;
          available_until?: string | null;
          caregiver_type?: "nurse" | "caretaker" | "physiotherapist" | "companion" | "other";
          created_at?: string;
          email?: string | null;
          experience_years?: number;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          notes?: string | null;
          parent_id: string;
          phone?: string | null;
          qualification?: string | null;
          service_area?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          available?: boolean;
          available_days?: number[];
          available_from?: string | null;
          available_until?: string | null;
          caregiver_type?: "nurse" | "caretaker" | "physiotherapist" | "companion" | "other";
          created_at?: string;
          email?: string | null;
          experience_years?: number;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          notes?: string | null;
          parent_id?: string;
          phone?: string | null;
          qualification?: string | null;
          service_area?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      transport_bookings: {
        Row: {
          arrived_at: string | null;
          assigned_at: string | null;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          destination: string;
          driver_id: string | null;
          driver_name: string | null;
          driver_phone: string | null;
          driver_vehicle: string | null;
          en_route_at: string | null;
          id: string;
          next_status_at: string | null;
          notes: string | null;
          parent_id: string;
          pickup_address: string;
          provider: string | null;
          purpose: Database["public"]["Enums"]["transport_purpose"];
          requested_by: string;
          return_date: string | null;
          return_time: string | null;
          scheduled_at: string;
          special_assistance: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          transport_date: string | null;
          transport_time: string | null;
          trip_type: Database["public"]["Enums"]["trip_type"];
          updated_at: string;
        };
        Insert: {
          arrived_at?: string | null;
          assigned_at?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          destination: string;
          driver_id?: string | null;
          driver_name?: string | null;
          driver_phone?: string | null;
          driver_vehicle?: string | null;
          en_route_at?: string | null;
          id?: string;
          next_status_at?: string | null;
          notes?: string | null;
          parent_id: string;
          pickup_address: string;
          provider?: string | null;
          purpose?: Database["public"]["Enums"]["transport_purpose"];
          requested_by: string;
          return_date?: string | null;
          return_time?: string | null;
          scheduled_at: string;
          special_assistance?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          transport_date?: string | null;
          transport_time?: string | null;
          trip_type?: Database["public"]["Enums"]["trip_type"];
          updated_at?: string;
        };
        Update: {
          arrived_at?: string | null;
          assigned_at?: string | null;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          destination?: string;
          driver_id?: string | null;
          driver_name?: string | null;
          driver_phone?: string | null;
          driver_vehicle?: string | null;
          en_route_at?: string | null;
          id?: string;
          next_status_at?: string | null;
          notes?: string | null;
          parent_id?: string;
          pickup_address?: string;
          provider?: string | null;
          purpose?: Database["public"]["Enums"]["transport_purpose"];
          requested_by?: string;
          return_date?: string | null;
          return_time?: string | null;
          scheduled_at?: string;
          special_assistance?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          transport_date?: string | null;
          transport_time?: string | null;
          trip_type?: Database["public"]["Enums"]["trip_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      video_consultations: {
        Row: {
          consultation_date: string | null;
          consultation_reason: string | null;
          consultation_time: string | null;
          created_at: string;
          doctor_name: string;
          id: string;
          meeting_url: string | null;
          notes: string | null;
          parent_id: string;
          requested_by: string;
          scheduled_at: string;
          specialty: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
          reminder_enabled: boolean | null;
          reminder_minutes_before: number | null;
          cancellation_reason: string | null;
        };
        Insert: {
          consultation_date?: string | null;
          consultation_reason?: string | null;
          consultation_time?: string | null;
          created_at?: string;
          doctor_name: string;
          id?: string;
          meeting_url?: string | null;
          notes?: string | null;
          parent_id: string;
          requested_by: string;
          scheduled_at: string;
          specialty?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          reminder_enabled?: boolean | null;
          reminder_minutes_before?: number | null;
          cancellation_reason?: string | null;
        };
        Update: {
          consultation_date?: string | null;
          consultation_reason?: string | null;
          consultation_time?: string | null;
          created_at?: string;
          doctor_name?: string;
          id?: string;
          meeting_url?: string | null;
          notes?: string | null;
          parent_id?: string;
          requested_by?: string;
          scheduled_at?: string;
          specialty?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
          reminder_enabled?: boolean | null;
          reminder_minutes_before?: number | null;
          cancellation_reason?: string | null;
        };
        Relationships: [];
      };
      consultation_prescriptions: {
        Row: {
          created_at: string;
          file_name: string | null;
          file_path: string;
          file_size: number | null;
          file_type: string;
          file_url: string | null;
          id: string;
          consultation_id: string;
          parent_id: string;
          uploaded_at: string;
        };
        Insert: {
          created_at?: string;
          file_name?: string | null;
          file_path: string;
          file_size?: number | null;
          file_type: string;
          file_url?: string | null;
          id?: string;
          consultation_id: string;
          parent_id: string;
          uploaded_at?: string;
        };
        Update: {
          created_at?: string;
          file_name?: string | null;
          file_path?: string;
          file_size?: number | null;
          file_type?: string;
          file_url?: string | null;
          id?: string;
          consultation_id?: string;
          parent_id?: string;
          uploaded_at?: string;
        };
        Relationships: [];
      };
      care_alerts: {
        Row: {
          id: string;
          parent_id: string;
          alert_type: string;
          severity: string | null;
          status: string;
          title: string | null;
          message: string | null;
          resolution_note: string | null;
          created_at: string;
          acknowledged_at: string | null;
          resolved_at: string | null;
          acknowledged_by: string | null;
          resolved_by: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          parent_id: string;
          alert_type: string;
          severity?: string | null;
          status?: string;
          title?: string | null;
          message?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          acknowledged_by?: string | null;
          resolved_by?: string | null;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          parent_id?: string;
          alert_type?: string;
          severity?: string | null;
          status?: string;
          title?: string | null;
          message?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          acknowledged_by?: string | null;
          resolved_by?: string | null;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      elder_settings: {
        Row: {
          parent_id: string;
          notify_email: boolean;
          notify_push: boolean;
          notify_sms: boolean;
          push_sos_enabled: boolean;
          push_medicine_enabled: boolean;
          push_wellbeing_enabled: boolean;
          push_appointments_enabled: boolean;
          push_caregiver_enabled: boolean;
          push_transport_enabled: boolean;
          push_video_enabled: boolean;
          push_emergency_detection_enabled: boolean;
          push_health_risk_enabled: boolean;
          push_companion_safety_enabled: boolean;
          med_reminders_enabled: boolean;
          med_reminder_lead_minutes: number;
          med_voice_reminders: boolean;
          appointment_reminders_enabled: boolean;
          wellbeing_reminders_enabled: boolean;
          emergency_detection_enabled: boolean;
          detect_missed_medicine: boolean;
          detect_missed_checkin: boolean;
          detect_no_app_activity: boolean;
          wellbeing_checkin_cutoff: string;
          no_app_activity_hours: number;
          health_risk_alerts_enabled: boolean;
          sos_escalation_minutes: number;
          sos_auto_call_primary: boolean;
          sos_share_location: boolean;
          preferred_contact_method: string;
          language: string;
          large_text: boolean;
          high_contrast: boolean;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          companion_auto_read_responses: boolean | null;
          companion_emergency_escalation_enabled: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          parent_id: string;
          notify_email?: boolean;
          notify_push?: boolean;
          notify_sms?: boolean;
          push_sos_enabled?: boolean;
          push_medicine_enabled?: boolean;
          push_wellbeing_enabled?: boolean;
          push_appointments_enabled?: boolean;
          push_caregiver_enabled?: boolean;
          push_transport_enabled?: boolean;
          push_video_enabled?: boolean;
          push_emergency_detection_enabled?: boolean;
          push_health_risk_enabled?: boolean;
          push_companion_safety_enabled?: boolean;
          med_reminders_enabled?: boolean;
          med_reminder_lead_minutes?: number;
          med_voice_reminders?: boolean;
          appointment_reminders_enabled?: boolean;
          wellbeing_reminders_enabled?: boolean;
          emergency_detection_enabled?: boolean;
          detect_missed_medicine?: boolean;
          detect_missed_checkin?: boolean;
          detect_no_app_activity?: boolean;
          wellbeing_checkin_cutoff?: string;
          no_app_activity_hours?: number;
          health_risk_alerts_enabled?: boolean;
          sos_escalation_minutes?: number;
          sos_auto_call_primary?: boolean;
          sos_share_location?: boolean;
          preferred_contact_method?: string;
          language?: string;
          large_text?: boolean;
          high_contrast?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          companion_auto_read_responses?: boolean | null;
          companion_emergency_escalation_enabled?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          parent_id?: string;
          notify_email?: boolean;
          notify_push?: boolean;
          notify_sms?: boolean;
          push_sos_enabled?: boolean;
          push_medicine_enabled?: boolean;
          push_wellbeing_enabled?: boolean;
          push_appointments_enabled?: boolean;
          push_caregiver_enabled?: boolean;
          push_transport_enabled?: boolean;
          push_video_enabled?: boolean;
          push_emergency_detection_enabled?: boolean;
          push_health_risk_enabled?: boolean;
          push_companion_safety_enabled?: boolean;
          med_reminders_enabled?: boolean;
          med_reminder_lead_minutes?: number;
          med_voice_reminders?: boolean;
          appointment_reminders_enabled?: boolean;
          wellbeing_reminders_enabled?: boolean;
          emergency_detection_enabled?: boolean;
          detect_missed_medicine?: boolean;
          detect_missed_checkin?: boolean;
          detect_no_app_activity?: boolean;
          wellbeing_checkin_cutoff?: string;
          no_app_activity_hours?: number;
          health_risk_alerts_enabled?: boolean;
          sos_escalation_minutes?: number;
          sos_auto_call_primary?: boolean;
          sos_share_location?: boolean;
          preferred_contact_method?: string;
          language?: string;
          large_text?: boolean;
          high_contrast?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          companion_auto_read_responses?: boolean | null;
          companion_emergency_escalation_enabled?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vitals: {
        Row: {
          id: string;
          parent_id: string;
          vital_type: string;
          value: number;
          value_secondary: number | null;
          recorded_at: string;
          created_at: string;
          notes: string | null;
          source: string | null;
        };
        Insert: {
          id?: string;
          parent_id: string;
          vital_type: string;
          value: number;
          value_secondary?: number | null;
          recorded_at?: string;
          created_at?: string;
          notes?: string | null;
          source?: string | null;
        };
        Update: {
          id?: string;
          parent_id?: string;
          vital_type?: string;
          value?: number;
          value_secondary?: number | null;
          recorded_at?: string;
          created_at?: string;
          notes?: string | null;
          source?: string | null;
        };
        Relationships: [];
      };
      emergency_contacts: {
        Row: {
          id: string;
          parent_id: string;
          name: string;
          relationship: string | null;
          phone: string | null;
          email: string | null;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          name: string;
          relationship?: string | null;
          phone?: string | null;
          email?: string | null;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string;
          name?: string;
          relationship?: string | null;
          phone?: string | null;
          email?: string | null;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      medical_file_access_logs: {
        Row: {
          id: string;
          actor_id: string;
          parent_id: string;
          document_kind: string;
          document_id: string;
          action: string;
          file_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          parent_id: string;
          document_kind: string;
          document_id: string;
          action: string;
          file_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          parent_id?: string;
          document_kind?: string;
          document_id?: string;
          action?: string;
          file_path?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      wellbeing_checks: {
        Row: {
          ate_meals: boolean | null;
          check_date: string;
          created_at: string;
          drank_water: boolean | null;
          energy_level: string | null;
          feeling: string | null;
          id: string;
          notes: string | null;
          parent_id: string;
          took_medicine: boolean | null;
          sleep_quality: string | null;
          pain_status: boolean | null;
          pain_notes: string | null;
          meals_logged: string | null;
          water_intake: number | null;
        };
        Insert: {
          ate_meals?: boolean | null;
          check_date?: string;
          created_at?: string;
          drank_water?: boolean | null;
          energy_level?: string | null;
          feeling?: string | null;
          id?: string;
          notes?: string | null;
          parent_id: string;
          took_medicine?: boolean | null;
          sleep_quality?: string | null;
          pain_status?: boolean | null;
          pain_notes?: string | null;
          meals_logged?: string | null;
          water_intake?: number | null;
        };
        Update: {
          ate_meals?: boolean | null;
          check_date?: string;
          created_at?: string;
          drank_water?: boolean | null;
          energy_level?: string | null;
          feeling?: string | null;
          id?: string;
          notes?: string | null;
          parent_id?: string;
          took_medicine?: boolean | null;
          sleep_quality?: string | null;
          pain_status?: boolean | null;
          pain_notes?: string | null;
          meals_logged?: string | null;
          water_intake?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_view_parent: {
        Args: {
          _parent: string;
        };
        Returns: boolean;
      };
      create_push_test_notification: {
        Args: never;
        Returns: string;
      };
      detect_care_issues: {
        Args: never;
        Returns: {
          missed_medicine_alerts: number;
          no_checkin_alerts: number;
          no_activity_alerts: number;
        }[];
      };
      detect_care_issues_for_parent: {
        Args: {
          _parent_id: string;
        };
        Returns: {
          missed_medicine_alerts: number;
          no_checkin_alerts: number;
          no_activity_alerts: number;
        }[];
      };
      set_care_alert_status: {
        Args: {
          _alert_id: string;
          _status: string;
          _resolution_note?: string | null;
        };
        Returns: void;
      };
      is_linked_child: {
        Args: {
          _parent: string;
        };
        Returns: boolean;
      };
      link_parent_by_invite_code: {
        Args: {
          _code: string;
          _phone?: string | null;
        };
        Returns: string;
      };
      regenerate_family_invite_code: {
        Args: never;
        Returns: string;
      };
      touch_app_activity: {
        Args: {
          _source?: string;
        };
        Returns: string;
      };
      raise_companion_safety_alert: {
        Args: {
          _category: string;
        };
        Returns: number;
      };
    };
    Enums: {
      booking_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "assigned"
        | "in_progress"
        | "driver_assigned"
        | "en_route"
        | "arrived"
        | "scheduled"
        | "waiting";
      caregiver_type: "nurse" | "caretaker" | "physiotherapist" | "companion";
      med_period: "morning" | "noon" | "evening" | "night";
      risk_level: "low" | "medium" | "high";
      sos_status: "active" | "acknowledged" | "resolved";
      transport_purpose: "hospital" | "checkup" | "emergency";
      trip_type: "one_way" | "round_trip";
      user_role: "parent" | "child";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];
export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;
export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;
export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;
export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
export const Constants = {
  public: {
    Enums: {
      booking_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "assigned",
        "in_progress",
        "driver_assigned",
        "en_route",
        "arrived",
        "scheduled",
        "waiting",
      ],
      caregiver_type: ["nurse", "caretaker", "physiotherapist", "companion"],
      med_period: ["morning", "noon", "evening", "night"],
      risk_level: ["low", "medium", "high"],
      sos_status: ["active", "acknowledged", "resolved"],
      transport_purpose: ["hospital", "checkup", "emergency"],
      trip_type: ["one_way", "round_trip"],
      user_role: ["parent", "child"],
    },
  },
} as const;
