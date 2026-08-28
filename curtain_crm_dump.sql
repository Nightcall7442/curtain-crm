--
-- PostgreSQL database dump
--

\restrict cPcLQn7L1A5qC6LeFJPSHl8Ok2Qn8mtoHsApw5wEY8GUeWH9HCaSALvUl26AIyZ

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: catalog_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.catalog_kind AS ENUM (
    'curtain_model',
    'material',
    'material_option',
    'color',
    'cornice',
    'tulle',
    'sachak',
    'accessory'
);


--
-- Name: department; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.department AS ENUM (
    'sewing',
    'installation',
    'cutting',
    'sales',
    'administration',
    'quality',
    'other'
);


--
-- Name: employment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employment_type AS ENUM (
    'permanent',
    'probation',
    'temporary',
    'intern'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'order_assigned',
    'order_status_changed',
    'order_rolled_back',
    'order_rejected_to_ceo',
    'order_qc_failed',
    'order_cancelled',
    'order_completed',
    'order_comment_added',
    'shift_adjusted',
    'payroll_approved',
    'payroll_paid',
    'role_changed'
);


--
-- Name: order_item_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_item_kind AS ENUM (
    'window',
    'door',
    'other'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'new',
    'pending_admin_review',
    'rejected_to_ceo',
    'measurement_assigned',
    'measurement_done',
    'pending_sewing_assignment',
    'sewing_in_progress',
    'sewing_done',
    'pending_qc',
    'qc_failed',
    'qc_passed',
    'pending_installation_assignment',
    'installation_assigned',
    'installation_in_progress',
    'installation_done',
    'completed',
    'cancelled'
);


--
-- Name: payroll_record_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payroll_record_status AS ENUM (
    'draft',
    'approved',
    'paid'
);


--
-- Name: payroll_scheme_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payroll_scheme_type AS ENUM (
    'fixed',
    'hourly',
    'kpi',
    'commission'
);


--
-- Name: photo_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.photo_stage AS ENUM (
    'measurement',
    'fabric',
    'cutting',
    'sewing_process',
    'qc',
    'install_before',
    'install_after',
    'general'
);


--
-- Name: priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority AS ENUM (
    'normal',
    'urgent',
    'critical'
);


--
-- Name: purchase_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_category AS ENUM (
    'fabric',
    'cornice',
    'accessory',
    'consumable',
    'other'
);


--
-- Name: purchase_unit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_unit AS ENUM (
    'm',
    'm2',
    'pcs',
    'set',
    'kg',
    'roll'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'ceo',
    'admin',
    'seller',
    'master',
    'sewer',
    'qc',
    'installer',
    'smm'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    actor_id integer NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id integer,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name text NOT NULL,
    address text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_meters integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT branches_latitude_range CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT branches_longitude_range CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT branches_radius_range CHECK (((radius_meters >= 20) AND (radius_meters <= 5000)))
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: catalog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_items (
    id integer NOT NULL,
    kind public.catalog_kind NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalog_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalog_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalog_items_id_seq OWNED BY public.catalog_items.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type public.notification_type NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    related_order_id integer,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_read_at_matches_flag CHECK (((is_read AND (read_at IS NOT NULL)) OR ((NOT is_read) AND (read_at IS NULL))))
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: order_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_comments (
    id integer NOT NULL,
    order_id integer NOT NULL,
    user_id integer NOT NULL,
    body text,
    is_voice boolean DEFAULT false NOT NULL,
    voice_storage_key text,
    voice_duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_comments_payload_required CHECK (((is_voice AND (voice_storage_key IS NOT NULL)) OR ((NOT is_voice) AND (body IS NOT NULL) AND (length(btrim(body)) > 0)))),
    CONSTRAINT order_comments_voice_duration_positive CHECK (((voice_duration_seconds IS NULL) OR (voice_duration_seconds > 0)))
);


--
-- Name: order_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_comments_id_seq OWNED BY public.order_comments.id;


--
-- Name: order_installation_team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_installation_team (
    order_id integer NOT NULL,
    user_id integer NOT NULL,
    added_by integer NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    kind public.order_item_kind DEFAULT 'window'::public.order_item_kind NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    model text,
    materials text[] DEFAULT '{}'::text[] NOT NULL,
    material_options text[] DEFAULT '{}'::text[] NOT NULL,
    color text,
    characteristics text,
    width_cm numeric(7,1),
    height_cm numeric(7,1),
    area_m2 numeric(10,4),
    cornice text,
    cornice_rotation text,
    tulle text,
    sachak text,
    accessory text,
    quantity integer DEFAULT 1 NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_height_range CHECK (((height_cm IS NULL) OR ((height_cm >= (1)::numeric) AND (height_cm <= (2000)::numeric)))),
    CONSTRAINT order_items_quantity_positive CHECK ((quantity > 0)),
    CONSTRAINT order_items_width_range CHECK (((width_cm IS NULL) OR ((width_cm >= (1)::numeric) AND (width_cm <= (2000)::numeric))))
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: order_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_photos (
    id integer NOT NULL,
    order_id integer NOT NULL,
    stage public.photo_stage DEFAULT 'general'::public.photo_stage NOT NULL,
    storage_key text NOT NULL,
    original_file_name text,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    uploaded_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_photos_mime_is_image CHECK ((mime_type ~~ 'image/%'::text)),
    CONSTRAINT order_photos_size_positive CHECK ((size_bytes > 0))
);


--
-- Name: order_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_photos_id_seq OWNED BY public.order_photos.id;


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id integer NOT NULL,
    order_id integer NOT NULL,
    from_status public.order_status,
    to_status public.order_status NOT NULL,
    changed_by integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_status_history_id_seq OWNED BY public.order_status_history.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_number text GENERATED ALWAYS AS (('DH-'::text || lpad((id)::text, 6, '0'::text))) STORED,
    branch_id integer NOT NULL,
    status public.order_status DEFAULT 'new'::public.order_status NOT NULL,
    priority public.priority DEFAULT 'normal'::public.priority NOT NULL,
    client_name text NOT NULL,
    client_phone text NOT NULL,
    client_comment text,
    install_address text,
    install_latitude double precision,
    install_longitude double precision,
    deadline date,
    work_price numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    deposit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    remaining_payment numeric(14,2) GENERATED ALWAYS AS ((work_price - deposit)) STORED,
    created_by integer NOT NULL,
    master_id integer,
    sewer_id integer,
    qc_id integer,
    installer_id integer,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orders_cancellation_reason_required CHECK (((status <> 'cancelled'::public.order_status) OR (cancellation_reason IS NOT NULL))),
    CONSTRAINT orders_client_phone_e164 CHECK ((client_phone ~ '^\+998[0-9]{9}$'::text)),
    CONSTRAINT orders_deposit_non_negative CHECK ((deposit >= (0)::numeric)),
    CONSTRAINT orders_work_price_non_negative CHECK ((work_price >= (0)::numeric))
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payroll_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_records (
    id integer NOT NULL,
    user_id integer NOT NULL,
    role public.role NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    scheme_snapshot jsonb NOT NULL,
    calculated_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    kpi_percent numeric(6,2),
    paid_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    status public.payroll_record_status DEFAULT 'draft'::public.payroll_record_status NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_records_amounts_non_negative CHECK (((calculated_amount >= (0)::numeric) AND (paid_amount >= (0)::numeric))),
    CONSTRAINT payroll_records_approval_metadata CHECK (((status = 'draft'::public.payroll_record_status) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT payroll_records_month_range CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT payroll_records_paid_metadata CHECK (((status <> 'paid'::public.payroll_record_status) OR (paid_at IS NOT NULL))),
    CONSTRAINT payroll_records_year_range CHECK (((period_year >= 2020) AND (period_year <= 2100)))
);


--
-- Name: payroll_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_records_id_seq OWNED BY public.payroll_records.id;


--
-- Name: payroll_schemes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_schemes (
    id integer NOT NULL,
    role public.role NOT NULL,
    type public.payroll_scheme_type NOT NULL,
    base_amount numeric(14,2),
    rate numeric(14,2),
    kpi_target numeric(14,4),
    commission_percent numeric(6,3),
    is_active boolean DEFAULT true NOT NULL,
    effective_from date NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_schemes_amounts_non_negative CHECK (((COALESCE(base_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(rate, (0)::numeric) >= (0)::numeric) AND ((COALESCE(commission_percent, (0)::numeric) >= (0)::numeric) AND (COALESCE(commission_percent, (0)::numeric) <= (100)::numeric)))),
    CONSTRAINT payroll_schemes_fields_match_type CHECK ((((type = 'fixed'::public.payroll_scheme_type) AND (base_amount IS NOT NULL)) OR ((type = 'hourly'::public.payroll_scheme_type) AND (rate IS NOT NULL)) OR ((type = 'kpi'::public.payroll_scheme_type) AND (base_amount IS NOT NULL) AND (rate IS NOT NULL) AND (kpi_target IS NOT NULL) AND (kpi_target > (0)::numeric)) OR ((type = 'commission'::public.payroll_scheme_type) AND (commission_percent IS NOT NULL))))
);


--
-- Name: payroll_schemes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_schemes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_schemes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_schemes_id_seq OWNED BY public.payroll_schemes.id;


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id integer NOT NULL,
    name text NOT NULL,
    unit public.purchase_unit NOT NULL,
    price numeric(14,2) NOT NULL,
    category public.purchase_category DEFAULT 'other'::public.purchase_category NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_items_price_non_negative CHECK ((price >= (0)::numeric))
);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_items_id_seq OWNED BY public.purchase_items.id;


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id integer NOT NULL,
    order_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    total_price numeric(14,2) GENERATED ALWAYS AS (round((quantity * unit_price), 2)) STORED,
    comment text,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchases_quantity_positive CHECK ((quantity > (0)::numeric)),
    CONSTRAINT purchases_unit_price_non_negative CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchases_id_seq OWNED BY public.purchases.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash text NOT NULL,
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    branch_id integer NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    start_latitude double precision,
    start_longitude double precision,
    start_distance_meters integer,
    end_latitude double precision,
    end_longitude double precision,
    end_distance_meters integer,
    is_manually_adjusted boolean DEFAULT false NOT NULL,
    adjusted_by integer,
    adjusted_at timestamp with time zone,
    adjustment_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shifts_adjustment_metadata_required CHECK (((NOT is_manually_adjusted) OR ((adjusted_by IS NOT NULL) AND (adjusted_at IS NOT NULL) AND (adjustment_reason IS NOT NULL)))),
    CONSTRAINT shifts_ended_after_started CHECK (((ended_at IS NULL) OR (ended_at > started_at)))
);


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: user_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_branches (
    user_id integer NOT NULL,
    branch_id integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role public.role NOT NULL,
    granted_by integer NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    password_hash text NOT NULL,
    telegram_id bigint,
    avatar_storage_key text,
    hired_at date,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_code text,
    job_title text,
    department public.department DEFAULT 'other'::public.department NOT NULL,
    employment_type public.employment_type DEFAULT 'permanent'::public.employment_type NOT NULL,
    birth_date date,
    fired_at date,
    CONSTRAINT users_fired_after_hired CHECK (((fired_at IS NULL) OR (hired_at IS NULL) OR (fired_at >= hired_at))),
    CONSTRAINT users_phone_e164 CHECK ((phone ~ '^\+998[0-9]{9}$'::text))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: catalog_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items ALTER COLUMN id SET DEFAULT nextval('public.catalog_items_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: order_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_comments ALTER COLUMN id SET DEFAULT nextval('public.order_comments_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: order_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_photos ALTER COLUMN id SET DEFAULT nextval('public.order_photos_id_seq'::regclass);


--
-- Name: order_status_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history ALTER COLUMN id SET DEFAULT nextval('public.order_status_history_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payroll_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records ALTER COLUMN id SET DEFAULT nextval('public.payroll_records_id_seq'::regclass);


--
-- Name: payroll_schemes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_schemes ALTER COLUMN id SET DEFAULT nextval('public.payroll_schemes_id_seq'::regclass);


--
-- Name: purchase_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_items_id_seq'::regclass);


--
-- Name: purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases ALTER COLUMN id SET DEFAULT nextval('public.purchases_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: -
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	cbd27fa842a33d80f7a80715802e400aab3d4041ee2760457032e524b707c9d1	1787756441784
2	3736a6bb76d6f824f45bc94f80b319b65e6c7a357c0485b233495614a927505f	1787759900667
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, actor_id, action, entity_type, entity_id, details, ip_address, created_at) FROM stdin;
61	1	order.created	order	4	{"clientName": "�������� ������", "itemsCount": 1}	\N	2026-08-26 22:36:49.513758+05
62	1	order.status_changed	order	4	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 22:36:49.513758+05
63	1	order.status_changed	order	4	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 22:48:55.465854+05
64	26	order.status_changed	order	5	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.687729+05
65	28	order.status_changed	order	6	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.698953+05
66	27	order.status_changed	order	7	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.707484+05
67	26	order.status_changed	order	8	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.713693+05
68	27	order.status_changed	order	9	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.719436+05
69	27	order.status_changed	order	10	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.726514+05
70	44	order.status_changed	order	10	{"comment": "Не согласована цена с клиентом", "toStatus": "rejected_to_ceo", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.728745+05
71	26	order.status_changed	order	11	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.737934+05
72	44	order.status_changed	order	11	{"comment": "Не согласована цена с клиентом", "toStatus": "rejected_to_ceo", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.74046+05
73	29	order.status_changed	order	12	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.748444+05
74	44	order.assignee_changed	order	12	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.751012+05
75	44	order.status_changed	order	12	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.755149+05
76	29	order.status_changed	order	13	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.762249+05
77	44	order.assignee_changed	order	13	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.764579+05
78	44	order.status_changed	order	13	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.767646+05
79	27	order.status_changed	order	14	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.774549+05
80	44	order.assignee_changed	order	14	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.776781+05
81	44	order.status_changed	order	14	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.779411+05
82	27	order.status_changed	order	15	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.786411+05
83	44	order.assignee_changed	order	15	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.788587+05
84	44	order.status_changed	order	15	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.791244+05
85	27	order.status_changed	order	16	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.797793+05
86	44	order.assignee_changed	order	16	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.799943+05
87	44	order.status_changed	order	16	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.802498+05
88	30	order.status_changed	order	16	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.805079+05
89	29	order.status_changed	order	17	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.812359+05
90	44	order.assignee_changed	order	17	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.814881+05
91	44	order.status_changed	order	17	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.817407+05
92	32	order.status_changed	order	17	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.819969+05
93	29	order.status_changed	order	18	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.826309+05
94	44	order.assignee_changed	order	18	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.828209+05
95	44	order.status_changed	order	18	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.83098+05
96	32	order.status_changed	order	18	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.833413+05
97	29	order.status_changed	order	19	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.839187+05
98	44	order.assignee_changed	order	19	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.841467+05
99	44	order.status_changed	order	19	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.844464+05
100	30	order.status_changed	order	19	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.847029+05
101	30	order.status_changed	order	19	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.849223+05
102	27	order.status_changed	order	20	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.857174+05
103	44	order.assignee_changed	order	20	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.859497+05
104	44	order.status_changed	order	20	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.86228+05
105	32	order.status_changed	order	20	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.864771+05
106	32	order.status_changed	order	20	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.867268+05
107	28	order.status_changed	order	21	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.874341+05
108	44	order.assignee_changed	order	21	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.876692+05
109	44	order.status_changed	order	21	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.879532+05
110	32	order.status_changed	order	21	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.881656+05
111	32	order.status_changed	order	21	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.883962+05
112	27	order.status_changed	order	22	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.889774+05
113	44	order.assignee_changed	order	22	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.891819+05
114	44	order.status_changed	order	22	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.894644+05
115	31	order.status_changed	order	22	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.896979+05
116	31	order.status_changed	order	22	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.899218+05
117	29	order.status_changed	order	23	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.904554+05
118	44	order.assignee_changed	order	23	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.906438+05
119	44	order.status_changed	order	23	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.908884+05
120	32	order.status_changed	order	23	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.911201+05
121	32	order.status_changed	order	23	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.913909+05
122	28	order.status_changed	order	24	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.921018+05
123	44	order.assignee_changed	order	24	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.923297+05
124	44	order.status_changed	order	24	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.92628+05
125	30	order.status_changed	order	24	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.928569+05
126	30	order.status_changed	order	24	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.930942+05
127	28	order.status_changed	order	25	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.93653+05
128	44	order.assignee_changed	order	25	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.938486+05
129	44	order.status_changed	order	25	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.941155+05
130	31	order.status_changed	order	25	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.94377+05
131	31	order.status_changed	order	25	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.945965+05
132	44	order.assignee_changed	order	25	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:49.94856+05
133	38	order.status_changed	order	25	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:49.951252+05
134	27	order.status_changed	order	26	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.956415+05
135	44	order.assignee_changed	order	26	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.958926+05
136	44	order.status_changed	order	26	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.961608+05
137	31	order.status_changed	order	26	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.964148+05
138	31	order.status_changed	order	26	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.966735+05
139	44	order.assignee_changed	order	26	{"to": 34, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:49.970213+05
140	34	order.status_changed	order	26	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:49.97324+05
141	27	order.status_changed	order	27	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:49.980106+05
142	44	order.assignee_changed	order	27	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:49.982369+05
143	44	order.status_changed	order	27	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:49.984772+05
144	30	order.status_changed	order	27	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:49.987521+05
145	30	order.status_changed	order	27	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:49.990128+05
146	44	order.assignee_changed	order	27	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:49.992384+05
147	36	order.status_changed	order	27	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:49.995263+05
148	27	order.status_changed	order	28	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.001324+05
149	44	order.assignee_changed	order	28	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.003842+05
150	44	order.status_changed	order	28	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.006319+05
151	30	order.status_changed	order	28	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.009036+05
152	30	order.status_changed	order	28	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.011585+05
153	44	order.assignee_changed	order	28	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.013885+05
154	38	order.status_changed	order	28	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.016557+05
155	26	order.status_changed	order	29	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.021699+05
156	44	order.assignee_changed	order	29	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.023526+05
157	44	order.status_changed	order	29	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.02613+05
158	32	order.status_changed	order	29	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.028819+05
159	32	order.status_changed	order	29	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.031273+05
160	44	order.assignee_changed	order	29	{"to": 37, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.034094+05
161	37	order.status_changed	order	29	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.036691+05
162	27	order.status_changed	order	30	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.042999+05
163	44	order.assignee_changed	order	30	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.045145+05
164	44	order.status_changed	order	30	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.047662+05
165	30	order.status_changed	order	30	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.050027+05
166	30	order.status_changed	order	30	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.052228+05
167	44	order.assignee_changed	order	30	{"to": 34, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.05452+05
168	34	order.status_changed	order	30	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.056866+05
169	28	order.status_changed	order	31	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.06153+05
170	44	order.assignee_changed	order	31	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.063326+05
171	44	order.status_changed	order	31	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.066312+05
172	31	order.status_changed	order	31	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.069085+05
173	31	order.status_changed	order	31	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.071626+05
174	44	order.assignee_changed	order	31	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.074087+05
175	38	order.status_changed	order	31	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.076809+05
176	28	order.status_changed	order	32	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.082391+05
177	44	order.assignee_changed	order	32	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.084421+05
178	44	order.status_changed	order	32	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.086959+05
179	31	order.status_changed	order	32	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.089415+05
180	31	order.status_changed	order	32	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.092017+05
181	44	order.assignee_changed	order	32	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.094464+05
182	33	order.status_changed	order	32	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.097436+05
183	33	order.status_changed	order	32	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.100309+05
184	28	order.status_changed	order	33	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.106529+05
185	44	order.assignee_changed	order	33	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.108732+05
186	44	order.status_changed	order	33	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.111257+05
187	30	order.status_changed	order	33	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.113512+05
188	30	order.status_changed	order	33	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.115936+05
189	44	order.assignee_changed	order	33	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.118648+05
190	33	order.status_changed	order	33	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.121068+05
191	33	order.status_changed	order	33	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.123554+05
192	28	order.status_changed	order	34	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.127508+05
193	44	order.assignee_changed	order	34	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.129761+05
194	44	order.status_changed	order	34	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.132178+05
195	32	order.status_changed	order	34	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.134725+05
649	1	user.password_reset	user	47	\N	\N	2026-08-27 01:07:45.105524+05
196	32	order.status_changed	order	34	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.137025+05
197	44	order.assignee_changed	order	34	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.13928+05
198	33	order.status_changed	order	34	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.141865+05
199	33	order.status_changed	order	34	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.144318+05
200	29	order.status_changed	order	35	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.150213+05
201	44	order.assignee_changed	order	35	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.152196+05
202	44	order.status_changed	order	35	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.154779+05
203	32	order.status_changed	order	35	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.15695+05
204	32	order.status_changed	order	35	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.159455+05
205	44	order.assignee_changed	order	35	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.161745+05
206	36	order.status_changed	order	35	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.164419+05
207	36	order.status_changed	order	35	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.166914+05
208	36	order.status_changed	order	35	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.169311+05
209	28	order.status_changed	order	36	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.174173+05
210	44	order.assignee_changed	order	36	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.176277+05
211	44	order.status_changed	order	36	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.178581+05
212	30	order.status_changed	order	36	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.180859+05
213	30	order.status_changed	order	36	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.187096+05
214	44	order.assignee_changed	order	36	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.188921+05
215	38	order.status_changed	order	36	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.191438+05
216	38	order.status_changed	order	36	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.198928+05
217	38	order.status_changed	order	36	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.201589+05
218	26	order.status_changed	order	37	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.206976+05
219	44	order.assignee_changed	order	37	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.209007+05
220	44	order.status_changed	order	37	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.211466+05
221	30	order.status_changed	order	37	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.213895+05
222	30	order.status_changed	order	37	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.216571+05
223	44	order.assignee_changed	order	37	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.218722+05
224	36	order.status_changed	order	37	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.221581+05
225	36	order.status_changed	order	37	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.223773+05
226	36	order.status_changed	order	37	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.225871+05
227	29	order.status_changed	order	38	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.230694+05
228	44	order.assignee_changed	order	38	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.232597+05
229	44	order.status_changed	order	38	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.234803+05
230	32	order.status_changed	order	38	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.237184+05
231	32	order.status_changed	order	38	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.238888+05
232	44	order.assignee_changed	order	38	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.240962+05
233	38	order.status_changed	order	38	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.243112+05
234	38	order.status_changed	order	38	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.244896+05
235	38	order.status_changed	order	38	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.246918+05
236	26	order.status_changed	order	39	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.250227+05
237	44	order.assignee_changed	order	39	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.251848+05
238	44	order.status_changed	order	39	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.25387+05
239	31	order.status_changed	order	39	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.255769+05
240	31	order.status_changed	order	39	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.257864+05
241	44	order.assignee_changed	order	39	{"to": 37, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.259595+05
242	37	order.status_changed	order	39	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.261916+05
243	37	order.status_changed	order	39	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.263764+05
244	37	order.status_changed	order	39	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.265928+05
245	26	order.status_changed	order	40	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.270011+05
246	44	order.assignee_changed	order	40	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.271747+05
247	44	order.status_changed	order	40	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.27396+05
248	32	order.status_changed	order	40	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.276013+05
249	32	order.status_changed	order	40	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.277694+05
250	44	order.assignee_changed	order	40	{"to": 35, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.279838+05
251	35	order.status_changed	order	40	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.281699+05
252	35	order.status_changed	order	40	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.283936+05
253	35	order.status_changed	order	40	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.286176+05
254	39	order.status_changed	order	40	{"comment": "Кривой шов по нижнему краю", "toStatus": "qc_failed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.288598+05
255	27	order.status_changed	order	41	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.29449+05
256	44	order.assignee_changed	order	41	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.296448+05
257	44	order.status_changed	order	41	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.299043+05
258	32	order.status_changed	order	41	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.30134+05
259	32	order.status_changed	order	41	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.303243+05
260	44	order.assignee_changed	order	41	{"to": 35, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.305864+05
261	35	order.status_changed	order	41	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.308378+05
262	35	order.status_changed	order	41	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.310275+05
263	35	order.status_changed	order	41	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.312503+05
264	39	order.status_changed	order	41	{"comment": "Замят ламбрекен при упаковке", "toStatus": "qc_failed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.3144+05
265	29	order.status_changed	order	42	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.321774+05
266	44	order.assignee_changed	order	42	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.323525+05
267	44	order.status_changed	order	42	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.325771+05
268	31	order.status_changed	order	42	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.327681+05
269	31	order.status_changed	order	42	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.329741+05
270	44	order.assignee_changed	order	42	{"to": 37, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.331436+05
271	37	order.status_changed	order	42	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.333772+05
272	37	order.status_changed	order	42	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.335758+05
273	37	order.status_changed	order	42	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.337879+05
274	40	order.status_changed	order	42	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.340347+05
275	26	order.status_changed	order	43	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.345237+05
276	44	order.assignee_changed	order	43	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.347018+05
277	44	order.status_changed	order	43	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.348958+05
278	32	order.status_changed	order	43	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.351191+05
279	32	order.status_changed	order	43	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.353045+05
280	44	order.assignee_changed	order	43	{"to": 37, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.355049+05
281	37	order.status_changed	order	43	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.357055+05
282	37	order.status_changed	order	43	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.359287+05
283	37	order.status_changed	order	43	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.361149+05
284	40	order.status_changed	order	43	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.363148+05
285	26	order.status_changed	order	44	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.367587+05
286	44	order.assignee_changed	order	44	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.369473+05
287	44	order.status_changed	order	44	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.37164+05
288	30	order.status_changed	order	44	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.373575+05
289	30	order.status_changed	order	44	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.375519+05
290	44	order.assignee_changed	order	44	{"to": 37, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.377332+05
291	37	order.status_changed	order	44	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.379413+05
292	37	order.status_changed	order	44	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.381347+05
293	37	order.status_changed	order	44	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.383461+05
294	39	order.status_changed	order	44	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.385161+05
295	28	order.status_changed	order	45	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.388541+05
296	44	order.assignee_changed	order	45	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.390407+05
297	44	order.status_changed	order	45	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.392432+05
298	31	order.status_changed	order	45	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.39481+05
299	31	order.status_changed	order	45	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.396834+05
300	44	order.assignee_changed	order	45	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.398699+05
301	33	order.status_changed	order	45	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.400945+05
302	33	order.status_changed	order	45	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.40294+05
303	33	order.status_changed	order	45	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.405588+05
304	39	order.status_changed	order	45	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.408146+05
305	39	order.status_changed	order	45	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.410104+05
306	27	order.status_changed	order	46	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.415133+05
307	44	order.assignee_changed	order	46	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.416972+05
308	44	order.status_changed	order	46	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.419454+05
309	32	order.status_changed	order	46	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.421527+05
310	32	order.status_changed	order	46	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.42343+05
311	44	order.assignee_changed	order	46	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.425447+05
312	36	order.status_changed	order	46	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.42752+05
313	36	order.status_changed	order	46	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.429934+05
314	36	order.status_changed	order	46	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.43181+05
315	39	order.status_changed	order	46	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.43415+05
316	39	order.status_changed	order	46	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.43661+05
317	28	order.status_changed	order	47	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.443746+05
318	44	order.assignee_changed	order	47	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.445233+05
319	44	order.status_changed	order	47	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.447365+05
320	32	order.status_changed	order	47	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.449102+05
321	32	order.status_changed	order	47	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.451054+05
322	44	order.assignee_changed	order	47	{"to": 34, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.452714+05
323	34	order.status_changed	order	47	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.454952+05
324	34	order.status_changed	order	47	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.456738+05
325	34	order.status_changed	order	47	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.458791+05
326	40	order.status_changed	order	47	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.461253+05
327	40	order.status_changed	order	47	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.46431+05
328	28	order.status_changed	order	48	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.469812+05
329	44	order.assignee_changed	order	48	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.471615+05
330	44	order.status_changed	order	48	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.47374+05
331	30	order.status_changed	order	48	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.475738+05
332	30	order.status_changed	order	48	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.477531+05
333	44	order.assignee_changed	order	48	{"to": 34, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.479525+05
334	34	order.status_changed	order	48	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.48132+05
335	34	order.status_changed	order	48	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.483584+05
336	34	order.status_changed	order	48	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.485353+05
337	40	order.status_changed	order	48	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.487587+05
338	40	order.status_changed	order	48	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.489504+05
339	29	order.status_changed	order	49	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.494972+05
340	44	order.assignee_changed	order	49	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.496697+05
341	44	order.status_changed	order	49	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.498719+05
342	31	order.status_changed	order	49	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.50074+05
343	31	order.status_changed	order	49	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.502419+05
344	44	order.assignee_changed	order	49	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.504271+05
345	38	order.status_changed	order	49	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.508707+05
346	38	order.status_changed	order	49	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.510577+05
347	38	order.status_changed	order	49	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.512603+05
348	40	order.status_changed	order	49	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.514667+05
349	40	order.status_changed	order	49	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.516785+05
350	44	order.assignee_changed	order	49	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.518964+05
351	44	order.status_changed	order	49	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.520925+05
352	26	order.status_changed	order	50	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.525437+05
353	44	order.assignee_changed	order	50	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.52747+05
354	44	order.status_changed	order	50	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.529626+05
355	30	order.status_changed	order	50	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.531296+05
356	30	order.status_changed	order	50	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.533686+05
357	44	order.assignee_changed	order	50	{"to": 38, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.535394+05
358	38	order.status_changed	order	50	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.537433+05
359	38	order.status_changed	order	50	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.53933+05
360	38	order.status_changed	order	50	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.541323+05
361	40	order.status_changed	order	50	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.543404+05
362	40	order.status_changed	order	50	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.545341+05
363	44	order.assignee_changed	order	50	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.547602+05
364	44	order.status_changed	order	50	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.549417+05
365	29	order.status_changed	order	51	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.555469+05
366	44	order.assignee_changed	order	51	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.557244+05
367	44	order.status_changed	order	51	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.559243+05
368	30	order.status_changed	order	51	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.561096+05
369	30	order.status_changed	order	51	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.562878+05
370	44	order.assignee_changed	order	51	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.564747+05
371	36	order.status_changed	order	51	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.566518+05
372	36	order.status_changed	order	51	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.568548+05
373	36	order.status_changed	order	51	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.570276+05
374	40	order.status_changed	order	51	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.572422+05
375	40	order.status_changed	order	51	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.574502+05
376	44	order.assignee_changed	order	51	{"to": 41, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.576596+05
377	44	order.status_changed	order	51	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.57897+05
378	26	order.status_changed	order	52	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.584224+05
379	44	order.assignee_changed	order	52	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.585718+05
380	44	order.status_changed	order	52	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.587835+05
381	32	order.status_changed	order	52	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.589995+05
382	32	order.status_changed	order	52	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.591638+05
383	44	order.assignee_changed	order	52	{"to": 35, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.593855+05
384	35	order.status_changed	order	52	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.595657+05
385	35	order.status_changed	order	52	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.597865+05
386	35	order.status_changed	order	52	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.599593+05
387	40	order.status_changed	order	52	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.60164+05
388	40	order.status_changed	order	52	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.603366+05
389	44	order.assignee_changed	order	52	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.605373+05
390	44	order.status_changed	order	52	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.607486+05
391	43	order.status_changed	order	52	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.609353+05
392	26	order.status_changed	order	53	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.614028+05
393	44	order.assignee_changed	order	53	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.616117+05
394	44	order.status_changed	order	53	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.619024+05
395	30	order.status_changed	order	53	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.621723+05
396	30	order.status_changed	order	53	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.624296+05
397	44	order.assignee_changed	order	53	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.626364+05
398	36	order.status_changed	order	53	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.628332+05
399	36	order.status_changed	order	53	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.630267+05
400	36	order.status_changed	order	53	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.632008+05
401	39	order.status_changed	order	53	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.634266+05
402	39	order.status_changed	order	53	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.636358+05
403	44	order.assignee_changed	order	53	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.638263+05
404	44	order.status_changed	order	53	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.641378+05
405	42	order.status_changed	order	53	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.643416+05
406	29	order.status_changed	order	54	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.64922+05
407	44	order.assignee_changed	order	54	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.651008+05
408	44	order.status_changed	order	54	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.652828+05
409	30	order.status_changed	order	54	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.655812+05
410	30	order.status_changed	order	54	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.657889+05
411	44	order.assignee_changed	order	54	{"to": 34, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.659585+05
412	34	order.status_changed	order	54	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.661556+05
413	34	order.status_changed	order	54	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.663402+05
414	34	order.status_changed	order	54	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.665582+05
415	39	order.status_changed	order	54	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.667611+05
416	39	order.status_changed	order	54	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.669915+05
417	44	order.assignee_changed	order	54	{"to": 41, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.672147+05
418	44	order.status_changed	order	54	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.674284+05
419	41	order.status_changed	order	54	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.677133+05
420	41	order.status_changed	order	54	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.679402+05
421	44	order.status_changed	order	54	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.681698+05
422	28	order.status_changed	order	55	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.686692+05
423	44	order.assignee_changed	order	55	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.68821+05
424	44	order.status_changed	order	55	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.690387+05
425	32	order.status_changed	order	55	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.692343+05
426	32	order.status_changed	order	55	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.694483+05
427	44	order.assignee_changed	order	55	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.696169+05
428	36	order.status_changed	order	55	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.698539+05
429	36	order.status_changed	order	55	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.700444+05
430	36	order.status_changed	order	55	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.702359+05
431	40	order.status_changed	order	55	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.704553+05
432	40	order.status_changed	order	55	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.70642+05
433	44	order.assignee_changed	order	55	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.708609+05
434	44	order.status_changed	order	55	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.711112+05
435	42	order.status_changed	order	55	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.713598+05
436	42	order.status_changed	order	55	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.715859+05
437	44	order.status_changed	order	55	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.717701+05
438	26	order.status_changed	order	56	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.72321+05
439	44	order.assignee_changed	order	56	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.724991+05
440	44	order.status_changed	order	56	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.727398+05
441	32	order.status_changed	order	56	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.729679+05
442	32	order.status_changed	order	56	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.731484+05
443	44	order.assignee_changed	order	56	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.733885+05
444	36	order.status_changed	order	56	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.736528+05
445	36	order.status_changed	order	56	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.738804+05
446	36	order.status_changed	order	56	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.741158+05
447	39	order.status_changed	order	56	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.743285+05
448	39	order.status_changed	order	56	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.745312+05
449	44	order.assignee_changed	order	56	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.747413+05
450	44	order.status_changed	order	56	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.749324+05
451	43	order.status_changed	order	56	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.751512+05
452	43	order.status_changed	order	56	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.753256+05
453	44	order.status_changed	order	56	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.755508+05
454	29	order.status_changed	order	57	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.761671+05
455	44	order.assignee_changed	order	57	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.763095+05
456	44	order.status_changed	order	57	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.765133+05
457	32	order.status_changed	order	57	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.766972+05
458	32	order.status_changed	order	57	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.769013+05
459	44	order.assignee_changed	order	57	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.770684+05
460	36	order.status_changed	order	57	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.772744+05
461	36	order.status_changed	order	57	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.774372+05
462	36	order.status_changed	order	57	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.77644+05
463	39	order.status_changed	order	57	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.778284+05
464	39	order.status_changed	order	57	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.780316+05
465	44	order.assignee_changed	order	57	{"to": 41, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.782095+05
466	44	order.status_changed	order	57	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.78431+05
467	41	order.status_changed	order	57	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.786582+05
468	41	order.status_changed	order	57	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.788457+05
469	44	order.status_changed	order	57	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.791004+05
470	26	order.status_changed	order	58	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.795296+05
471	44	order.assignee_changed	order	58	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.79735+05
472	44	order.status_changed	order	58	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.799179+05
473	32	order.status_changed	order	58	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.801428+05
474	32	order.status_changed	order	58	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.80331+05
475	44	order.assignee_changed	order	58	{"to": 34, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.805326+05
476	34	order.status_changed	order	58	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.80751+05
477	34	order.status_changed	order	58	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.809479+05
478	34	order.status_changed	order	58	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.811487+05
479	39	order.status_changed	order	58	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.813343+05
480	39	order.status_changed	order	58	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.815986+05
481	44	order.assignee_changed	order	58	{"to": 41, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.817929+05
482	44	order.status_changed	order	58	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.822303+05
483	41	order.status_changed	order	58	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.824536+05
484	41	order.status_changed	order	58	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.826847+05
485	44	order.status_changed	order	58	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.828944+05
486	28	order.status_changed	order	59	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.834537+05
487	44	order.assignee_changed	order	59	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.836451+05
488	44	order.status_changed	order	59	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.838525+05
489	30	order.status_changed	order	59	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.840564+05
490	30	order.status_changed	order	59	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.84244+05
491	44	order.assignee_changed	order	59	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.844529+05
492	33	order.status_changed	order	59	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.84658+05
493	33	order.status_changed	order	59	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.848682+05
494	33	order.status_changed	order	59	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.850772+05
495	40	order.status_changed	order	59	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.85272+05
496	40	order.status_changed	order	59	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.854859+05
497	44	order.assignee_changed	order	59	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.856654+05
498	44	order.status_changed	order	59	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.858899+05
499	43	order.status_changed	order	59	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.86084+05
500	43	order.status_changed	order	59	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.862912+05
501	44	order.status_changed	order	59	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.86491+05
502	28	order.status_changed	order	60	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.869161+05
503	44	order.assignee_changed	order	60	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.870742+05
504	44	order.status_changed	order	60	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.87325+05
505	30	order.status_changed	order	60	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.876044+05
506	30	order.status_changed	order	60	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.87792+05
507	44	order.assignee_changed	order	60	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.88+05
508	36	order.status_changed	order	60	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.88179+05
509	36	order.status_changed	order	60	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.884002+05
510	36	order.status_changed	order	60	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.885773+05
511	39	order.status_changed	order	60	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.887884+05
512	39	order.status_changed	order	60	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.889972+05
513	44	order.assignee_changed	order	60	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.891708+05
514	44	order.status_changed	order	60	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.893938+05
515	42	order.status_changed	order	60	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.895985+05
516	42	order.status_changed	order	60	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.898553+05
517	44	order.status_changed	order	60	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.900672+05
518	27	order.status_changed	order	61	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.905913+05
519	44	order.assignee_changed	order	61	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.907583+05
520	44	order.status_changed	order	61	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.909591+05
521	30	order.status_changed	order	61	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.911577+05
522	30	order.status_changed	order	61	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.913273+05
523	44	order.assignee_changed	order	61	{"to": 35, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.915298+05
524	35	order.status_changed	order	61	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.917334+05
525	35	order.status_changed	order	61	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.919392+05
526	35	order.status_changed	order	61	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.921015+05
527	40	order.status_changed	order	61	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.922977+05
528	40	order.status_changed	order	61	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.924715+05
529	44	order.assignee_changed	order	61	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.927132+05
530	44	order.status_changed	order	61	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.929357+05
531	43	order.status_changed	order	61	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.931372+05
532	43	order.status_changed	order	61	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.933507+05
533	44	order.status_changed	order	61	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.935244+05
534	27	order.status_changed	order	62	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.940376+05
535	44	order.assignee_changed	order	62	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.941857+05
536	44	order.status_changed	order	62	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.943902+05
537	31	order.status_changed	order	62	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.945793+05
538	31	order.status_changed	order	62	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.948102+05
539	44	order.assignee_changed	order	62	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.949693+05
540	33	order.status_changed	order	62	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.95202+05
541	33	order.status_changed	order	62	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.953817+05
542	33	order.status_changed	order	62	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.955701+05
543	40	order.status_changed	order	62	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.957783+05
544	40	order.status_changed	order	62	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.959916+05
545	44	order.assignee_changed	order	62	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.962151+05
546	44	order.status_changed	order	62	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.963984+05
547	43	order.status_changed	order	62	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.966369+05
548	43	order.status_changed	order	62	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.968449+05
549	44	order.status_changed	order	62	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.97038+05
550	27	order.status_changed	order	63	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:50.974359+05
551	44	order.assignee_changed	order	63	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:50.976226+05
552	44	order.status_changed	order	63	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:50.978201+05
553	30	order.status_changed	order	63	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:50.980788+05
554	30	order.status_changed	order	63	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.983229+05
555	44	order.assignee_changed	order	63	{"to": 35, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:50.98504+05
556	35	order.status_changed	order	63	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.987324+05
557	35	order.status_changed	order	63	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:50.989076+05
558	35	order.status_changed	order	63	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:50.991136+05
559	39	order.status_changed	order	63	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:50.992911+05
560	39	order.status_changed	order	63	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:50.994976+05
561	44	order.assignee_changed	order	63	{"to": 41, "from": null, "role": "installer"}	\N	2026-08-26 23:09:50.997009+05
562	44	order.status_changed	order	63	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:50.998882+05
563	41	order.status_changed	order	63	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.001067+05
564	41	order.status_changed	order	63	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.003357+05
565	44	order.status_changed	order	63	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.005916+05
566	29	order.status_changed	order	64	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.01122+05
567	44	order.assignee_changed	order	64	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:51.012793+05
568	44	order.status_changed	order	64	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.014682+05
569	31	order.status_changed	order	64	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.016555+05
570	31	order.status_changed	order	64	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.018467+05
571	44	order.assignee_changed	order	64	{"to": 37, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:51.020224+05
572	37	order.status_changed	order	64	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.02243+05
573	37	order.status_changed	order	64	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.02432+05
574	37	order.status_changed	order	64	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.026997+05
575	39	order.status_changed	order	64	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:51.029212+05
576	39	order.status_changed	order	64	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:51.031493+05
577	44	order.assignee_changed	order	64	{"to": 43, "from": null, "role": "installer"}	\N	2026-08-26 23:09:51.033663+05
578	44	order.status_changed	order	64	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.035493+05
579	43	order.status_changed	order	64	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.037532+05
580	43	order.status_changed	order	64	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.039312+05
581	44	order.status_changed	order	64	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.041315+05
582	28	order.status_changed	order	65	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.046839+05
583	44	order.assignee_changed	order	65	{"to": 31, "from": null, "role": "master"}	\N	2026-08-26 23:09:51.048439+05
584	44	order.status_changed	order	65	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.050474+05
585	31	order.status_changed	order	65	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.052426+05
586	31	order.status_changed	order	65	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.054421+05
587	44	order.assignee_changed	order	65	{"to": 36, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:51.05634+05
588	36	order.status_changed	order	65	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.058613+05
589	36	order.status_changed	order	65	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.060299+05
590	36	order.status_changed	order	65	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.062314+05
591	40	order.status_changed	order	65	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:51.064224+05
592	40	order.status_changed	order	65	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:51.066325+05
593	44	order.assignee_changed	order	65	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-26 23:09:51.068509+05
594	44	order.status_changed	order	65	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.070507+05
595	42	order.status_changed	order	65	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.072784+05
596	42	order.status_changed	order	65	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.074513+05
597	44	order.status_changed	order	65	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.076651+05
598	29	order.status_changed	order	66	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.081162+05
599	44	order.assignee_changed	order	66	{"to": 32, "from": null, "role": "master"}	\N	2026-08-26 23:09:51.083056+05
600	44	order.status_changed	order	66	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.084856+05
601	32	order.status_changed	order	66	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.087037+05
602	32	order.status_changed	order	66	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.088737+05
603	44	order.assignee_changed	order	66	{"to": 35, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:51.090741+05
604	35	order.status_changed	order	66	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.092499+05
605	35	order.status_changed	order	66	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.094624+05
606	35	order.status_changed	order	66	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.096383+05
607	40	order.status_changed	order	66	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:51.098438+05
608	40	order.status_changed	order	66	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:51.100296+05
609	44	order.assignee_changed	order	66	{"to": 41, "from": null, "role": "installer"}	\N	2026-08-26 23:09:51.102281+05
610	44	order.status_changed	order	66	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.104809+05
611	41	order.status_changed	order	66	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.106951+05
612	41	order.status_changed	order	66	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.109093+05
613	44	order.status_changed	order	66	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.110894+05
614	29	order.status_changed	order	67	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.115677+05
615	44	order.assignee_changed	order	67	{"to": 30, "from": null, "role": "master"}	\N	2026-08-26 23:09:51.117093+05
616	44	order.status_changed	order	67	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.119142+05
617	30	order.status_changed	order	67	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.1208+05
618	30	order.status_changed	order	67	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.122913+05
619	44	order.assignee_changed	order	67	{"to": 33, "from": null, "role": "sewer"}	\N	2026-08-26 23:09:51.127343+05
620	33	order.status_changed	order	67	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.129572+05
621	33	order.status_changed	order	67	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.131388+05
622	33	order.status_changed	order	67	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.133407+05
623	39	order.status_changed	order	67	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-26 23:09:51.13515+05
624	39	order.status_changed	order	67	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-26 23:09:51.137379+05
625	44	order.assignee_changed	order	67	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-26 23:09:51.139466+05
626	44	order.status_changed	order	67	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-26 23:09:51.141522+05
627	42	order.status_changed	order	67	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-26 23:09:51.143704+05
628	42	order.status_changed	order	67	{"comment": null, "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": false}	\N	2026-08-26 23:09:51.145616+05
629	44	order.status_changed	order	67	{"comment": null, "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": false}	\N	2026-08-26 23:09:51.147837+05
630	28	order.status_changed	order	68	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.153141+05
631	44	order.cancelled	order	68	{"comment": "Клиент выбрал другого подрядчика", "toStatus": "cancelled", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.155129+05
632	26	order.status_changed	order	69	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.161623+05
633	44	order.cancelled	order	69	{"comment": "Клиент отказался от заказа", "toStatus": "cancelled", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.163299+05
634	26	order.status_changed	order	70	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-26 23:09:51.168055+05
635	44	order.cancelled	order	70	{"comment": "Клиент выбрал другого подрядчика", "toStatus": "cancelled", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-26 23:09:51.169858+05
636	1	payroll.approved	payroll_record	6	{"amount": "1773000.00"}	\N	2026-08-27 00:59:49.540384+05
637	1	payroll.paid	payroll_record	6	{"paid": "1773000.00", "calculated": "1773000.00"}	\N	2026-08-27 00:59:52.202025+05
638	1	branch.created	branch	9	{"name": "UI-TEST Цех 864893", "radiusMeters": 120}	\N	2026-08-27 01:07:44.899733+05
639	1	branch.updated	branch	9	{"radiusMeters": {"to": 200, "from": 120}}	\N	2026-08-27 01:07:44.917069+05
640	1	catalog.item_created	catalog_item	202	{"kind": "curtain_model", "name": "UI-TEST модель 864893"}	\N	2026-08-27 01:07:44.931806+05
641	1	catalog.item_updated	catalog_item	202	{"name": "UI-TEST модель 864893b"}	\N	2026-08-27 01:07:44.938873+05
642	1	catalog.item_deactivated	catalog_item	202	{"isActive": false}	\N	2026-08-27 01:07:44.947474+05
646	1	user.role_granted	user	47	{"role": "qc"}	\N	2026-08-27 01:07:45.073192+05
643	1	purchase_item.created	purchase_item	19	{"name": "UI-TEST ткань 864893", "unit": "m", "price": "99000.00"}	\N	2026-08-27 01:07:44.966347+05
647	1	user.role_revoked	user	47	{"role": "qc"}	\N	2026-08-27 01:07:45.085213+05
650	1	user.deactivated	user	47	\N	\N	2026-08-27 01:07:45.298311+05
644	1	purchase_item.price_changed	purchase_item	19	{"to": {"price": "105000.00"}, "from": {"price": "99000.00"}}	\N	2026-08-27 01:07:44.980041+05
648	1	user.updated	user	47	{"jobTitle": "Старшая швея"}	\N	2026-08-27 01:07:45.101131+05
651	1	user.activated	user	47	\N	\N	2026-08-27 01:07:45.315009+05
645	1	user.created	user	47	{"roles": ["sewer"], "fullName": "UI-TEST Сотрудник 864893", "branchIds": [9]}	\N	2026-08-27 01:07:45.060103+05
654	1	order.price_changed	order	71	{"to": {"deposit": "4000000.00", "workPrice": "9500000.00"}, "from": {"deposit": "3000000.00", "workPrice": "9000000.00"}}	\N	2026-08-27 01:07:45.342594+05
652	1	order.created	order	71	{"clientName": "UI-TEST Клиент 864893", "itemsCount": 1}	\N	2026-08-27 01:07:45.325603+05
653	1	order.status_changed	order	71	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-27 01:07:45.325603+05
655	1	order.assignee_changed	order	71	{"to": 30, "from": null, "role": "master"}	\N	2026-08-27 01:07:45.392443+05
668	1	order.status_changed	order	71	{"comment": "Загружено фото после установки — заказ закрыт автоматически", "toStatus": "installation_done", "fromStatus": "installation_in_progress", "systemInitiated": true}	\N	2026-08-27 01:07:45.650582+05
669	1	order.status_changed	order	71	{"comment": "Загружено фото после установки — заказ закрыт автоматически", "toStatus": "completed", "fromStatus": "installation_done", "systemInitiated": true}	\N	2026-08-27 01:07:45.650582+05
671	1	order.created	order	72	{"clientName": "UI-TEST Отмена 864893", "itemsCount": 1}	\N	2026-08-27 01:07:45.735739+05
672	1	order.status_changed	order	72	{"comment": null, "toStatus": "pending_admin_review", "fromStatus": "new", "systemInitiated": false}	\N	2026-08-27 01:07:45.735739+05
656	1	order.assignee_changed	order	71	{"to": 47, "from": null, "role": "sewer"}	\N	2026-08-27 01:07:45.419229+05
657	1	order.status_changed	order	71	{"comment": null, "toStatus": "measurement_assigned", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-27 01:07:45.498941+05
658	1	order.status_changed	order	71	{"comment": null, "toStatus": "measurement_done", "fromStatus": "measurement_assigned", "systemInitiated": false}	\N	2026-08-27 01:07:45.508428+05
662	1	order.status_changed	order	71	{"comment": null, "toStatus": "pending_qc", "fromStatus": "sewing_done", "systemInitiated": false}	\N	2026-08-27 01:07:45.573655+05
663	1	order.status_changed	order	71	{"comment": null, "toStatus": "qc_passed", "fromStatus": "pending_qc", "systemInitiated": false}	\N	2026-08-27 01:07:45.589913+05
667	1	order.status_changed	order	71	{"comment": null, "toStatus": "installation_in_progress", "fromStatus": "installation_assigned", "systemInitiated": false}	\N	2026-08-27 01:07:45.640273+05
670	1	payroll.scheme_changed	payroll_scheme	9	{"role": "smm", "type": "fixed"}	\N	2026-08-27 01:07:45.713748+05
675	1	shift.deleted	shift	617	{"reason": "Уборка после проверки", "userId": 47, "endedAt": "2026-08-26T02:09:16.764Z", "startedAt": "2026-08-25T18:09:16.764Z"}	\N	2026-08-27 01:09:16.795712+05
659	1	order.status_changed	order	71	{"comment": null, "toStatus": "pending_sewing_assignment", "fromStatus": "measurement_done", "systemInitiated": false}	\N	2026-08-27 01:07:45.525807+05
664	1	order.status_changed	order	71	{"comment": null, "toStatus": "pending_installation_assignment", "fromStatus": "qc_passed", "systemInitiated": false}	\N	2026-08-27 01:07:45.604392+05
660	1	order.status_changed	order	71	{"comment": null, "toStatus": "sewing_in_progress", "fromStatus": "pending_sewing_assignment", "systemInitiated": false}	\N	2026-08-27 01:07:45.534178+05
661	1	order.status_changed	order	71	{"comment": null, "toStatus": "sewing_done", "fromStatus": "sewing_in_progress", "systemInitiated": false}	\N	2026-08-27 01:07:45.555128+05
665	1	order.assignee_changed	order	71	{"to": 42, "from": null, "role": "installer"}	\N	2026-08-27 01:07:45.615313+05
666	1	order.status_changed	order	71	{"comment": null, "toStatus": "installation_assigned", "fromStatus": "pending_installation_assignment", "systemInitiated": false}	\N	2026-08-27 01:07:45.622222+05
673	1	order.cancelled	order	72	{"comment": "UI-TEST: проверка отмены", "toStatus": "cancelled", "fromStatus": "pending_admin_review", "systemInitiated": false}	\N	2026-08-27 01:07:45.759127+05
674	1	shift.adjusted	shift	617	{"after": {"userId": 47, "endedAt": "2026-08-26T02:09:16.764Z", "startedAt": "2026-08-25T18:09:16.764Z"}, "before": null, "reason": "Проверка superjson-кодирования", "created": true}	\N	2026-08-27 01:09:16.78032+05
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.branches (id, name, address, latitude, longitude, radius_meters, is_active, created_at, updated_at) FROM stdin;
1	Цех №1	\N	41.2995	69.2401	100	t	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
8	Цех №2 Ургенч (демо)	г. Ургенч, ул. Ал-Хорезми, 12	41.5829	60.6095	150	t	2026-08-26 23:09:49.520574+05	2026-08-26 23:09:49.520574+05
\.


--
-- Data for Name: catalog_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.catalog_items (id, kind, name, sort_order, is_active, created_by, created_at, updated_at) FROM stdin;
1	curtain_model	Прямые	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
2	curtain_model	Жингалак	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
3	curtain_model	Римские	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
4	curtain_model	Австрийские	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
5	curtain_model	Французские	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
6	curtain_model	Японские	5	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
7	curtain_model	Плиссе	6	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
8	curtain_model	Рулонные	7	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
9	curtain_model	Шторы-кафе	8	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
10	curtain_model	Нитяные	9	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
11	curtain_model	Бамбуковые	10	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
12	curtain_model	Двойные	11	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
13	curtain_model	Ламбрекен	12	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
14	curtain_model	Блэкаут	13	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
15	material	Блэкаут	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
16	material	Велюр	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
17	material	Лён	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
18	material	Шёлк	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
19	material	Атлас	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
20	material	Габардин	5	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
21	material	Тюль	6	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
22	material	Органза	7	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
23	material	Жаккард	8	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
24	material	Хлопок	9	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
25	material_option	Бархатные	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
26	material_option	Шёлк	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
27	material_option	Матовый	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
28	material_option	Глянцевый	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
29	material_option	Перламутровый	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
30	material_option	Текстурный	5	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
31	material_option	Однотонный	6	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
32	material_option	С рисунком	7	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
33	material_option	С принтом	8	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
34	color	Белый	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
35	color	Бежевый	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
36	color	Коричневый	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
37	color	Серый	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
38	color	Чёрный	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
39	color	Синий	5	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
40	color	Зелёный	6	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
41	color	Красный	7	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
42	color	Золотой	8	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
43	color	Серебряный	9	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
44	cornice	Профильный алюминий	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
45	cornice	Круглый металл	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
46	cornice	Круглый дерево	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
47	cornice	Потолочный пластик	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
48	cornice	Потолочный алюминий	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
49	cornice	Струнный	5	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
50	cornice	Электро	6	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
51	cornice	Багетный	7	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
52	cornice	Магнитный	8	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
53	cornice	Двойной	9	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
54	tulle	Органза	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
55	tulle	Сетка	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
56	tulle	Вуаль	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
57	tulle	Шёлковая	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
58	tulle	Полиэстер	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
59	sachak	Лента-шнур	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
60	sachak	Магнитный	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
61	sachak	На липучке	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
62	sachak	Крючки	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
63	accessory	Подхваты	0	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
64	accessory	Кисти	1	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
65	accessory	Заколки	2	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
66	accessory	Магниты	3	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
67	accessory	Шторный шнур	4	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, type, title, body, related_order_id, is_read, read_at, created_at) FROM stdin;
1146	30	payroll_approved	Расчёт за 08.2026 утверждён	Сумма: 1 773 000 сум	\N	f	\N	2026-08-27 00:59:49.540384+05
1147	30	payroll_paid	Зарплата за 08.2026 выплачена	Сумма: 1 773 000 сум	\N	f	\N	2026-08-27 00:59:52.202025+05
148	27	order_rejected_to_ceo	Заказ DH-000010: Отклонён, решение за директором	Дилшод Мирзаев перевёл заказ в статус «Отклонён, решение за директором». Причина: Не согласована цена с клиентом	10	f	\N	2026-08-26 23:09:49.728745+05
149	26	order_rejected_to_ceo	Заказ DH-000011: Отклонён, решение за директором	Дилшод Мирзаев перевёл заказ в статус «Отклонён, решение за директором». Причина: Не согласована цена с клиентом	11	f	\N	2026-08-26 23:09:49.74046+05
150	30	order_assigned	Новый заказ DH-000012	Вам назначен заказ клиента «Камолова Дилноза» как «Мастер-замерщик»	12	f	\N	2026-08-26 23:09:49.751012+05
151	29	order_status_changed	Заказ DH-000012: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	12	f	\N	2026-08-26 23:09:49.755149+05
152	30	order_status_changed	Заказ DH-000012: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	12	f	\N	2026-08-26 23:09:49.755149+05
153	31	order_assigned	Новый заказ DH-000013	Вам назначен заказ клиента «Тураева Мохира» как «Мастер-замерщик»	13	f	\N	2026-08-26 23:09:49.764579+05
154	29	order_status_changed	Заказ DH-000013: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	13	f	\N	2026-08-26 23:09:49.767646+05
155	31	order_status_changed	Заказ DH-000013: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	13	f	\N	2026-08-26 23:09:49.767646+05
156	31	order_assigned	Новый заказ DH-000014	Вам назначен заказ клиента «Абдуллаева Севара» как «Мастер-замерщик»	14	f	\N	2026-08-26 23:09:49.776781+05
157	27	order_status_changed	Заказ DH-000014: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	14	f	\N	2026-08-26 23:09:49.779411+05
158	31	order_status_changed	Заказ DH-000014: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	14	f	\N	2026-08-26 23:09:49.779411+05
159	30	order_assigned	Новый заказ DH-000015	Вам назначен заказ клиента «Нурматов Шерзод» как «Мастер-замерщик»	15	f	\N	2026-08-26 23:09:49.788587+05
160	27	order_status_changed	Заказ DH-000015: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	15	f	\N	2026-08-26 23:09:49.791244+05
161	30	order_status_changed	Заказ DH-000015: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	15	f	\N	2026-08-26 23:09:49.791244+05
162	30	order_assigned	Новый заказ DH-000016	Вам назначен заказ клиента «Абдуллаева Севара» как «Мастер-замерщик»	16	f	\N	2026-08-26 23:09:49.799943+05
163	27	order_status_changed	Заказ DH-000016: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	16	f	\N	2026-08-26 23:09:49.802498+05
164	30	order_status_changed	Заказ DH-000016: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	16	f	\N	2026-08-26 23:09:49.802498+05
165	27	order_status_changed	Заказ DH-000016: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	16	f	\N	2026-08-26 23:09:49.805079+05
166	32	order_assigned	Новый заказ DH-000017	Вам назначен заказ клиента «Собирова Гульнара» как «Мастер-замерщик»	17	f	\N	2026-08-26 23:09:49.814881+05
167	29	order_status_changed	Заказ DH-000017: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	17	f	\N	2026-08-26 23:09:49.817407+05
168	32	order_status_changed	Заказ DH-000017: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	17	f	\N	2026-08-26 23:09:49.817407+05
169	29	order_status_changed	Заказ DH-000017: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	17	f	\N	2026-08-26 23:09:49.819969+05
170	32	order_assigned	Новый заказ DH-000018	Вам назначен заказ клиента «Салимова Гулбахор» как «Мастер-замерщик»	18	f	\N	2026-08-26 23:09:49.828209+05
171	29	order_status_changed	Заказ DH-000018: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	18	f	\N	2026-08-26 23:09:49.83098+05
172	32	order_status_changed	Заказ DH-000018: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	18	f	\N	2026-08-26 23:09:49.83098+05
173	29	order_status_changed	Заказ DH-000018: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	18	f	\N	2026-08-26 23:09:49.833413+05
174	30	order_assigned	Новый заказ DH-000019	Вам назначен заказ клиента «Собирова Гульнара» как «Мастер-замерщик»	19	f	\N	2026-08-26 23:09:49.841467+05
175	29	order_status_changed	Заказ DH-000019: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	19	f	\N	2026-08-26 23:09:49.844464+05
176	30	order_status_changed	Заказ DH-000019: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	19	f	\N	2026-08-26 23:09:49.844464+05
177	29	order_status_changed	Заказ DH-000019: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	19	f	\N	2026-08-26 23:09:49.847029+05
178	29	order_status_changed	Заказ DH-000019: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	19	f	\N	2026-08-26 23:09:49.849223+05
179	32	order_assigned	Новый заказ DH-000020	Вам назначен заказ клиента «Раззакова Малика» как «Мастер-замерщик»	20	f	\N	2026-08-26 23:09:49.859497+05
180	27	order_status_changed	Заказ DH-000020: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	20	f	\N	2026-08-26 23:09:49.86228+05
181	32	order_status_changed	Заказ DH-000020: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	20	f	\N	2026-08-26 23:09:49.86228+05
182	27	order_status_changed	Заказ DH-000020: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	20	f	\N	2026-08-26 23:09:49.864771+05
183	27	order_status_changed	Заказ DH-000020: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	20	f	\N	2026-08-26 23:09:49.867268+05
184	32	order_assigned	Новый заказ DH-000021	Вам назначен заказ клиента «Икрамова Нодира» как «Мастер-замерщик»	21	f	\N	2026-08-26 23:09:49.876692+05
185	28	order_status_changed	Заказ DH-000021: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	21	f	\N	2026-08-26 23:09:49.879532+05
186	32	order_status_changed	Заказ DH-000021: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	21	f	\N	2026-08-26 23:09:49.879532+05
187	28	order_status_changed	Заказ DH-000021: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	21	f	\N	2026-08-26 23:09:49.881656+05
188	28	order_status_changed	Заказ DH-000021: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	21	f	\N	2026-08-26 23:09:49.883962+05
189	31	order_assigned	Новый заказ DH-000022	Вам назначен заказ клиента «Салимова Гулбахор» как «Мастер-замерщик»	22	f	\N	2026-08-26 23:09:49.891819+05
190	27	order_status_changed	Заказ DH-000022: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	22	f	\N	2026-08-26 23:09:49.894644+05
191	31	order_status_changed	Заказ DH-000022: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	22	f	\N	2026-08-26 23:09:49.894644+05
192	27	order_status_changed	Заказ DH-000022: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	22	f	\N	2026-08-26 23:09:49.896979+05
193	27	order_status_changed	Заказ DH-000022: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	22	f	\N	2026-08-26 23:09:49.899218+05
194	32	order_assigned	Новый заказ DH-000023	Вам назначен заказ клиента «Нурматов Шерзод» как «Мастер-замерщик»	23	f	\N	2026-08-26 23:09:49.906438+05
195	29	order_status_changed	Заказ DH-000023: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	23	f	\N	2026-08-26 23:09:49.908884+05
196	32	order_status_changed	Заказ DH-000023: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	23	f	\N	2026-08-26 23:09:49.908884+05
197	29	order_status_changed	Заказ DH-000023: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	23	f	\N	2026-08-26 23:09:49.911201+05
198	29	order_status_changed	Заказ DH-000023: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	23	f	\N	2026-08-26 23:09:49.913909+05
199	30	order_assigned	Новый заказ DH-000024	Вам назначен заказ клиента «Мирзоева Феруза» как «Мастер-замерщик»	24	f	\N	2026-08-26 23:09:49.923297+05
200	28	order_status_changed	Заказ DH-000024: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	24	f	\N	2026-08-26 23:09:49.92628+05
201	30	order_status_changed	Заказ DH-000024: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	24	f	\N	2026-08-26 23:09:49.92628+05
202	28	order_status_changed	Заказ DH-000024: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	24	f	\N	2026-08-26 23:09:49.928569+05
203	28	order_status_changed	Заказ DH-000024: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	24	f	\N	2026-08-26 23:09:49.930942+05
204	31	order_assigned	Новый заказ DH-000025	Вам назначен заказ клиента «Икрамова Нодира» как «Мастер-замерщик»	25	f	\N	2026-08-26 23:09:49.938486+05
205	28	order_status_changed	Заказ DH-000025: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	25	f	\N	2026-08-26 23:09:49.941155+05
206	31	order_status_changed	Заказ DH-000025: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	25	f	\N	2026-08-26 23:09:49.941155+05
207	28	order_status_changed	Заказ DH-000025: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	25	f	\N	2026-08-26 23:09:49.94377+05
208	28	order_status_changed	Заказ DH-000025: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	25	f	\N	2026-08-26 23:09:49.945965+05
209	38	order_assigned	Новый заказ DH-000025	Вам назначен заказ клиента «Икрамова Нодира» как «Швея»	25	f	\N	2026-08-26 23:09:49.94856+05
210	28	order_status_changed	Заказ DH-000025: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	25	f	\N	2026-08-26 23:09:49.951252+05
211	31	order_status_changed	Заказ DH-000025: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	25	f	\N	2026-08-26 23:09:49.951252+05
212	31	order_assigned	Новый заказ DH-000026	Вам назначен заказ клиента «Нурматов Шерзод» как «Мастер-замерщик»	26	f	\N	2026-08-26 23:09:49.958926+05
213	27	order_status_changed	Заказ DH-000026: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	26	f	\N	2026-08-26 23:09:49.961608+05
214	31	order_status_changed	Заказ DH-000026: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	26	f	\N	2026-08-26 23:09:49.961608+05
215	27	order_status_changed	Заказ DH-000026: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	26	f	\N	2026-08-26 23:09:49.964148+05
216	27	order_status_changed	Заказ DH-000026: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	26	f	\N	2026-08-26 23:09:49.966735+05
217	34	order_assigned	Новый заказ DH-000026	Вам назначен заказ клиента «Нурматов Шерзод» как «Швея»	26	f	\N	2026-08-26 23:09:49.970213+05
218	27	order_status_changed	Заказ DH-000026: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	26	f	\N	2026-08-26 23:09:49.97324+05
219	31	order_status_changed	Заказ DH-000026: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	26	f	\N	2026-08-26 23:09:49.97324+05
220	30	order_assigned	Новый заказ DH-000027	Вам назначен заказ клиента «Тошпулатов Азамат» как «Мастер-замерщик»	27	f	\N	2026-08-26 23:09:49.982369+05
221	27	order_status_changed	Заказ DH-000027: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	27	f	\N	2026-08-26 23:09:49.984772+05
222	30	order_status_changed	Заказ DH-000027: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	27	f	\N	2026-08-26 23:09:49.984772+05
223	27	order_status_changed	Заказ DH-000027: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	27	f	\N	2026-08-26 23:09:49.987521+05
224	27	order_status_changed	Заказ DH-000027: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	27	f	\N	2026-08-26 23:09:49.990128+05
225	36	order_assigned	Новый заказ DH-000027	Вам назначен заказ клиента «Тошпулатов Азамат» как «Швея»	27	f	\N	2026-08-26 23:09:49.992384+05
226	27	order_status_changed	Заказ DH-000027: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	27	f	\N	2026-08-26 23:09:49.995263+05
227	30	order_status_changed	Заказ DH-000027: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	27	f	\N	2026-08-26 23:09:49.995263+05
228	30	order_assigned	Новый заказ DH-000028	Вам назначен заказ клиента «Ахмедов Тимур» как «Мастер-замерщик»	28	f	\N	2026-08-26 23:09:50.003842+05
229	27	order_status_changed	Заказ DH-000028: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	28	f	\N	2026-08-26 23:09:50.006319+05
230	30	order_status_changed	Заказ DH-000028: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	28	f	\N	2026-08-26 23:09:50.006319+05
231	27	order_status_changed	Заказ DH-000028: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	28	f	\N	2026-08-26 23:09:50.009036+05
232	27	order_status_changed	Заказ DH-000028: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	28	f	\N	2026-08-26 23:09:50.011585+05
233	38	order_assigned	Новый заказ DH-000028	Вам назначен заказ клиента «Ахмедов Тимур» как «Швея»	28	f	\N	2026-08-26 23:09:50.013885+05
234	27	order_status_changed	Заказ DH-000028: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	28	f	\N	2026-08-26 23:09:50.016557+05
235	30	order_status_changed	Заказ DH-000028: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	28	f	\N	2026-08-26 23:09:50.016557+05
236	32	order_assigned	Новый заказ DH-000029	Вам назначен заказ клиента «Мирзоева Феруза» как «Мастер-замерщик»	29	f	\N	2026-08-26 23:09:50.023526+05
237	26	order_status_changed	Заказ DH-000029: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	29	f	\N	2026-08-26 23:09:50.02613+05
238	32	order_status_changed	Заказ DH-000029: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	29	f	\N	2026-08-26 23:09:50.02613+05
239	26	order_status_changed	Заказ DH-000029: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	29	f	\N	2026-08-26 23:09:50.028819+05
240	26	order_status_changed	Заказ DH-000029: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	29	f	\N	2026-08-26 23:09:50.031273+05
241	37	order_assigned	Новый заказ DH-000029	Вам назначен заказ клиента «Мирзоева Феруза» как «Швея»	29	f	\N	2026-08-26 23:09:50.034094+05
242	26	order_status_changed	Заказ DH-000029: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	29	f	\N	2026-08-26 23:09:50.036691+05
243	32	order_status_changed	Заказ DH-000029: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	29	f	\N	2026-08-26 23:09:50.036691+05
244	30	order_assigned	Новый заказ DH-000030	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Мастер-замерщик»	30	f	\N	2026-08-26 23:09:50.045145+05
245	27	order_status_changed	Заказ DH-000030: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	30	f	\N	2026-08-26 23:09:50.047662+05
246	30	order_status_changed	Заказ DH-000030: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	30	f	\N	2026-08-26 23:09:50.047662+05
247	27	order_status_changed	Заказ DH-000030: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	30	f	\N	2026-08-26 23:09:50.050027+05
248	27	order_status_changed	Заказ DH-000030: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	30	f	\N	2026-08-26 23:09:50.052228+05
249	34	order_assigned	Новый заказ DH-000030	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Швея»	30	f	\N	2026-08-26 23:09:50.05452+05
250	27	order_status_changed	Заказ DH-000030: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	30	f	\N	2026-08-26 23:09:50.056866+05
251	30	order_status_changed	Заказ DH-000030: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	30	f	\N	2026-08-26 23:09:50.056866+05
252	31	order_assigned	Новый заказ DH-000031	Вам назначен заказ клиента «Нурматов Шерзод» как «Мастер-замерщик»	31	f	\N	2026-08-26 23:09:50.063326+05
253	28	order_status_changed	Заказ DH-000031: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	31	f	\N	2026-08-26 23:09:50.066312+05
254	31	order_status_changed	Заказ DH-000031: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	31	f	\N	2026-08-26 23:09:50.066312+05
255	28	order_status_changed	Заказ DH-000031: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	31	f	\N	2026-08-26 23:09:50.069085+05
256	28	order_status_changed	Заказ DH-000031: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	31	f	\N	2026-08-26 23:09:50.071626+05
257	38	order_assigned	Новый заказ DH-000031	Вам назначен заказ клиента «Нурматов Шерзод» как «Швея»	31	f	\N	2026-08-26 23:09:50.074087+05
258	28	order_status_changed	Заказ DH-000031: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	31	f	\N	2026-08-26 23:09:50.076809+05
259	31	order_status_changed	Заказ DH-000031: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	31	f	\N	2026-08-26 23:09:50.076809+05
260	31	order_assigned	Новый заказ DH-000032	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Мастер-замерщик»	32	f	\N	2026-08-26 23:09:50.084421+05
261	28	order_status_changed	Заказ DH-000032: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	32	f	\N	2026-08-26 23:09:50.086959+05
262	31	order_status_changed	Заказ DH-000032: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	32	f	\N	2026-08-26 23:09:50.086959+05
263	28	order_status_changed	Заказ DH-000032: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	32	f	\N	2026-08-26 23:09:50.089415+05
264	28	order_status_changed	Заказ DH-000032: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	32	f	\N	2026-08-26 23:09:50.092017+05
265	33	order_assigned	Новый заказ DH-000032	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Швея»	32	f	\N	2026-08-26 23:09:50.094464+05
266	28	order_status_changed	Заказ DH-000032: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	32	f	\N	2026-08-26 23:09:50.097436+05
267	31	order_status_changed	Заказ DH-000032: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	32	f	\N	2026-08-26 23:09:50.097436+05
268	28	order_status_changed	Заказ DH-000032: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	32	f	\N	2026-08-26 23:09:50.100309+05
269	31	order_status_changed	Заказ DH-000032: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	32	f	\N	2026-08-26 23:09:50.100309+05
270	30	order_assigned	Новый заказ DH-000033	Вам назначен заказ клиента «Тошпулатов Азамат» как «Мастер-замерщик»	33	f	\N	2026-08-26 23:09:50.108732+05
271	28	order_status_changed	Заказ DH-000033: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	33	f	\N	2026-08-26 23:09:50.111257+05
272	30	order_status_changed	Заказ DH-000033: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	33	f	\N	2026-08-26 23:09:50.111257+05
273	28	order_status_changed	Заказ DH-000033: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	33	f	\N	2026-08-26 23:09:50.113512+05
274	28	order_status_changed	Заказ DH-000033: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	33	f	\N	2026-08-26 23:09:50.115936+05
275	33	order_assigned	Новый заказ DH-000033	Вам назначен заказ клиента «Тошпулатов Азамат» как «Швея»	33	f	\N	2026-08-26 23:09:50.118648+05
276	28	order_status_changed	Заказ DH-000033: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	33	f	\N	2026-08-26 23:09:50.121068+05
277	30	order_status_changed	Заказ DH-000033: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	33	f	\N	2026-08-26 23:09:50.121068+05
278	28	order_status_changed	Заказ DH-000033: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	33	f	\N	2026-08-26 23:09:50.123554+05
279	30	order_status_changed	Заказ DH-000033: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	33	f	\N	2026-08-26 23:09:50.123554+05
280	32	order_assigned	Новый заказ DH-000034	Вам назначен заказ клиента «Каримова Дилором» как «Мастер-замерщик»	34	f	\N	2026-08-26 23:09:50.129761+05
281	28	order_status_changed	Заказ DH-000034: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	34	f	\N	2026-08-26 23:09:50.132178+05
282	32	order_status_changed	Заказ DH-000034: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	34	f	\N	2026-08-26 23:09:50.132178+05
283	28	order_status_changed	Заказ DH-000034: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	34	f	\N	2026-08-26 23:09:50.134725+05
284	28	order_status_changed	Заказ DH-000034: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	34	f	\N	2026-08-26 23:09:50.137025+05
285	33	order_assigned	Новый заказ DH-000034	Вам назначен заказ клиента «Каримова Дилором» как «Швея»	34	f	\N	2026-08-26 23:09:50.13928+05
286	28	order_status_changed	Заказ DH-000034: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	34	f	\N	2026-08-26 23:09:50.141865+05
287	32	order_status_changed	Заказ DH-000034: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	34	f	\N	2026-08-26 23:09:50.141865+05
288	28	order_status_changed	Заказ DH-000034: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	34	f	\N	2026-08-26 23:09:50.144318+05
289	32	order_status_changed	Заказ DH-000034: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	34	f	\N	2026-08-26 23:09:50.144318+05
290	32	order_assigned	Новый заказ DH-000035	Вам назначен заказ клиента «Икрамова Нодира» как «Мастер-замерщик»	35	f	\N	2026-08-26 23:09:50.152196+05
291	29	order_status_changed	Заказ DH-000035: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	35	f	\N	2026-08-26 23:09:50.154779+05
292	32	order_status_changed	Заказ DH-000035: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	35	f	\N	2026-08-26 23:09:50.154779+05
293	29	order_status_changed	Заказ DH-000035: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	35	f	\N	2026-08-26 23:09:50.15695+05
294	29	order_status_changed	Заказ DH-000035: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	35	f	\N	2026-08-26 23:09:50.159455+05
295	36	order_assigned	Новый заказ DH-000035	Вам назначен заказ клиента «Икрамова Нодира» как «Швея»	35	f	\N	2026-08-26 23:09:50.161745+05
296	29	order_status_changed	Заказ DH-000035: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	35	f	\N	2026-08-26 23:09:50.164419+05
297	32	order_status_changed	Заказ DH-000035: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	35	f	\N	2026-08-26 23:09:50.164419+05
298	29	order_status_changed	Заказ DH-000035: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	35	f	\N	2026-08-26 23:09:50.166914+05
299	32	order_status_changed	Заказ DH-000035: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	35	f	\N	2026-08-26 23:09:50.166914+05
300	29	order_status_changed	Заказ DH-000035: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	35	f	\N	2026-08-26 23:09:50.169311+05
301	32	order_status_changed	Заказ DH-000035: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	35	f	\N	2026-08-26 23:09:50.169311+05
302	30	order_assigned	Новый заказ DH-000036	Вам назначен заказ клиента «Икрамова Нодира» как «Мастер-замерщик»	36	f	\N	2026-08-26 23:09:50.176277+05
303	28	order_status_changed	Заказ DH-000036: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	36	f	\N	2026-08-26 23:09:50.178581+05
304	30	order_status_changed	Заказ DH-000036: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	36	f	\N	2026-08-26 23:09:50.178581+05
305	28	order_status_changed	Заказ DH-000036: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	36	f	\N	2026-08-26 23:09:50.180859+05
306	28	order_status_changed	Заказ DH-000036: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	36	f	\N	2026-08-26 23:09:50.187096+05
307	38	order_assigned	Новый заказ DH-000036	Вам назначен заказ клиента «Икрамова Нодира» как «Швея»	36	f	\N	2026-08-26 23:09:50.188921+05
308	28	order_status_changed	Заказ DH-000036: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	36	f	\N	2026-08-26 23:09:50.191438+05
309	30	order_status_changed	Заказ DH-000036: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	36	f	\N	2026-08-26 23:09:50.191438+05
310	28	order_status_changed	Заказ DH-000036: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	36	f	\N	2026-08-26 23:09:50.198928+05
311	30	order_status_changed	Заказ DH-000036: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	36	f	\N	2026-08-26 23:09:50.198928+05
312	28	order_status_changed	Заказ DH-000036: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	36	f	\N	2026-08-26 23:09:50.201589+05
313	30	order_status_changed	Заказ DH-000036: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	36	f	\N	2026-08-26 23:09:50.201589+05
314	30	order_assigned	Новый заказ DH-000037	Вам назначен заказ клиента «Мирзоева Феруза» как «Мастер-замерщик»	37	f	\N	2026-08-26 23:09:50.209007+05
315	26	order_status_changed	Заказ DH-000037: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	37	f	\N	2026-08-26 23:09:50.211466+05
316	30	order_status_changed	Заказ DH-000037: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	37	f	\N	2026-08-26 23:09:50.211466+05
317	26	order_status_changed	Заказ DH-000037: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	37	f	\N	2026-08-26 23:09:50.213895+05
318	26	order_status_changed	Заказ DH-000037: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	37	f	\N	2026-08-26 23:09:50.216571+05
319	36	order_assigned	Новый заказ DH-000037	Вам назначен заказ клиента «Мирзоева Феруза» как «Швея»	37	f	\N	2026-08-26 23:09:50.218722+05
320	26	order_status_changed	Заказ DH-000037: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	37	f	\N	2026-08-26 23:09:50.221581+05
321	30	order_status_changed	Заказ DH-000037: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	37	f	\N	2026-08-26 23:09:50.221581+05
322	26	order_status_changed	Заказ DH-000037: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	37	f	\N	2026-08-26 23:09:50.223773+05
323	30	order_status_changed	Заказ DH-000037: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	37	f	\N	2026-08-26 23:09:50.223773+05
324	26	order_status_changed	Заказ DH-000037: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	37	f	\N	2026-08-26 23:09:50.225871+05
325	30	order_status_changed	Заказ DH-000037: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	37	f	\N	2026-08-26 23:09:50.225871+05
326	32	order_assigned	Новый заказ DH-000038	Вам назначен заказ клиента «Бекмуродов Фаррух» как «Мастер-замерщик»	38	f	\N	2026-08-26 23:09:50.232597+05
327	29	order_status_changed	Заказ DH-000038: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	38	f	\N	2026-08-26 23:09:50.234803+05
328	32	order_status_changed	Заказ DH-000038: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	38	f	\N	2026-08-26 23:09:50.234803+05
329	29	order_status_changed	Заказ DH-000038: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	38	f	\N	2026-08-26 23:09:50.237184+05
330	29	order_status_changed	Заказ DH-000038: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	38	f	\N	2026-08-26 23:09:50.238888+05
331	38	order_assigned	Новый заказ DH-000038	Вам назначен заказ клиента «Бекмуродов Фаррух» как «Швея»	38	f	\N	2026-08-26 23:09:50.240962+05
332	29	order_status_changed	Заказ DH-000038: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	38	f	\N	2026-08-26 23:09:50.243112+05
333	32	order_status_changed	Заказ DH-000038: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	38	f	\N	2026-08-26 23:09:50.243112+05
334	29	order_status_changed	Заказ DH-000038: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	38	f	\N	2026-08-26 23:09:50.244896+05
335	32	order_status_changed	Заказ DH-000038: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	38	f	\N	2026-08-26 23:09:50.244896+05
336	29	order_status_changed	Заказ DH-000038: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	38	f	\N	2026-08-26 23:09:50.246918+05
337	32	order_status_changed	Заказ DH-000038: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	38	f	\N	2026-08-26 23:09:50.246918+05
338	31	order_assigned	Новый заказ DH-000039	Вам назначен заказ клиента «Хамидова Зарина» как «Мастер-замерщик»	39	f	\N	2026-08-26 23:09:50.251848+05
339	26	order_status_changed	Заказ DH-000039: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	39	f	\N	2026-08-26 23:09:50.25387+05
340	31	order_status_changed	Заказ DH-000039: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	39	f	\N	2026-08-26 23:09:50.25387+05
341	26	order_status_changed	Заказ DH-000039: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	39	f	\N	2026-08-26 23:09:50.255769+05
342	26	order_status_changed	Заказ DH-000039: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	39	f	\N	2026-08-26 23:09:50.257864+05
343	37	order_assigned	Новый заказ DH-000039	Вам назначен заказ клиента «Хамидова Зарина» как «Швея»	39	f	\N	2026-08-26 23:09:50.259595+05
344	26	order_status_changed	Заказ DH-000039: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	39	f	\N	2026-08-26 23:09:50.261916+05
345	31	order_status_changed	Заказ DH-000039: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	39	f	\N	2026-08-26 23:09:50.261916+05
346	26	order_status_changed	Заказ DH-000039: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	39	f	\N	2026-08-26 23:09:50.263764+05
347	31	order_status_changed	Заказ DH-000039: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	39	f	\N	2026-08-26 23:09:50.263764+05
348	26	order_status_changed	Заказ DH-000039: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	39	f	\N	2026-08-26 23:09:50.265928+05
349	31	order_status_changed	Заказ DH-000039: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	39	f	\N	2026-08-26 23:09:50.265928+05
350	32	order_assigned	Новый заказ DH-000040	Вам назначен заказ клиента «Хамидова Зарина» как «Мастер-замерщик»	40	f	\N	2026-08-26 23:09:50.271747+05
351	26	order_status_changed	Заказ DH-000040: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	40	f	\N	2026-08-26 23:09:50.27396+05
352	32	order_status_changed	Заказ DH-000040: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	40	f	\N	2026-08-26 23:09:50.27396+05
353	26	order_status_changed	Заказ DH-000040: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	40	f	\N	2026-08-26 23:09:50.276013+05
354	26	order_status_changed	Заказ DH-000040: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	40	f	\N	2026-08-26 23:09:50.277694+05
355	35	order_assigned	Новый заказ DH-000040	Вам назначен заказ клиента «Хамидова Зарина» как «Швея»	40	f	\N	2026-08-26 23:09:50.279838+05
356	26	order_status_changed	Заказ DH-000040: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	40	f	\N	2026-08-26 23:09:50.281699+05
357	32	order_status_changed	Заказ DH-000040: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	40	f	\N	2026-08-26 23:09:50.281699+05
358	26	order_status_changed	Заказ DH-000040: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	40	f	\N	2026-08-26 23:09:50.283936+05
359	32	order_status_changed	Заказ DH-000040: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	40	f	\N	2026-08-26 23:09:50.283936+05
360	26	order_status_changed	Заказ DH-000040: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	40	f	\N	2026-08-26 23:09:50.286176+05
361	32	order_status_changed	Заказ DH-000040: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	40	f	\N	2026-08-26 23:09:50.286176+05
362	26	order_qc_failed	Заказ DH-000040: Брак, возврат на доработку	Нилуфар Ахмедова перевёл заказ в статус «Брак, возврат на доработку». Причина: Кривой шов по нижнему краю	40	f	\N	2026-08-26 23:09:50.288598+05
363	32	order_qc_failed	Заказ DH-000040: Брак, возврат на доработку	Нилуфар Ахмедова перевёл заказ в статус «Брак, возврат на доработку». Причина: Кривой шов по нижнему краю	40	f	\N	2026-08-26 23:09:50.288598+05
364	35	order_qc_failed	Заказ DH-000040: Брак, возврат на доработку	Нилуфар Ахмедова перевёл заказ в статус «Брак, возврат на доработку». Причина: Кривой шов по нижнему краю	40	f	\N	2026-08-26 23:09:50.288598+05
365	32	order_assigned	Новый заказ DH-000041	Вам назначен заказ клиента «Эргашев Санжар» как «Мастер-замерщик»	41	f	\N	2026-08-26 23:09:50.296448+05
366	27	order_status_changed	Заказ DH-000041: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	41	f	\N	2026-08-26 23:09:50.299043+05
367	32	order_status_changed	Заказ DH-000041: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	41	f	\N	2026-08-26 23:09:50.299043+05
368	27	order_status_changed	Заказ DH-000041: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	41	f	\N	2026-08-26 23:09:50.30134+05
369	27	order_status_changed	Заказ DH-000041: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	41	f	\N	2026-08-26 23:09:50.303243+05
370	35	order_assigned	Новый заказ DH-000041	Вам назначен заказ клиента «Эргашев Санжар» как «Швея»	41	f	\N	2026-08-26 23:09:50.305864+05
371	27	order_status_changed	Заказ DH-000041: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	41	f	\N	2026-08-26 23:09:50.308378+05
372	32	order_status_changed	Заказ DH-000041: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	41	f	\N	2026-08-26 23:09:50.308378+05
373	27	order_status_changed	Заказ DH-000041: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	41	f	\N	2026-08-26 23:09:50.310275+05
374	32	order_status_changed	Заказ DH-000041: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	41	f	\N	2026-08-26 23:09:50.310275+05
375	27	order_status_changed	Заказ DH-000041: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	41	f	\N	2026-08-26 23:09:50.312503+05
376	32	order_status_changed	Заказ DH-000041: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	41	f	\N	2026-08-26 23:09:50.312503+05
377	27	order_qc_failed	Заказ DH-000041: Брак, возврат на доработку	Нилуфар Ахмедова перевёл заказ в статус «Брак, возврат на доработку». Причина: Замят ламбрекен при упаковке	41	f	\N	2026-08-26 23:09:50.3144+05
378	32	order_qc_failed	Заказ DH-000041: Брак, возврат на доработку	Нилуфар Ахмедова перевёл заказ в статус «Брак, возврат на доработку». Причина: Замят ламбрекен при упаковке	41	f	\N	2026-08-26 23:09:50.3144+05
379	35	order_qc_failed	Заказ DH-000041: Брак, возврат на доработку	Нилуфар Ахмедова перевёл заказ в статус «Брак, возврат на доработку». Причина: Замят ламбрекен при упаковке	41	f	\N	2026-08-26 23:09:50.3144+05
380	31	order_assigned	Новый заказ DH-000042	Вам назначен заказ клиента «Икрамова Нодира» как «Мастер-замерщик»	42	f	\N	2026-08-26 23:09:50.323525+05
381	29	order_status_changed	Заказ DH-000042: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	42	f	\N	2026-08-26 23:09:50.325771+05
382	31	order_status_changed	Заказ DH-000042: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	42	f	\N	2026-08-26 23:09:50.325771+05
383	29	order_status_changed	Заказ DH-000042: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	42	f	\N	2026-08-26 23:09:50.327681+05
384	29	order_status_changed	Заказ DH-000042: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	42	f	\N	2026-08-26 23:09:50.329741+05
385	37	order_assigned	Новый заказ DH-000042	Вам назначен заказ клиента «Икрамова Нодира» как «Швея»	42	f	\N	2026-08-26 23:09:50.331436+05
386	29	order_status_changed	Заказ DH-000042: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	42	f	\N	2026-08-26 23:09:50.333772+05
387	31	order_status_changed	Заказ DH-000042: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	42	f	\N	2026-08-26 23:09:50.333772+05
388	29	order_status_changed	Заказ DH-000042: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	42	f	\N	2026-08-26 23:09:50.335758+05
389	31	order_status_changed	Заказ DH-000042: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	42	f	\N	2026-08-26 23:09:50.335758+05
390	29	order_status_changed	Заказ DH-000042: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	42	f	\N	2026-08-26 23:09:50.337879+05
391	31	order_status_changed	Заказ DH-000042: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	42	f	\N	2026-08-26 23:09:50.337879+05
392	29	order_status_changed	Заказ DH-000042: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	42	f	\N	2026-08-26 23:09:50.340347+05
393	31	order_status_changed	Заказ DH-000042: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	42	f	\N	2026-08-26 23:09:50.340347+05
394	37	order_status_changed	Заказ DH-000042: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	42	f	\N	2026-08-26 23:09:50.340347+05
395	32	order_assigned	Новый заказ DH-000043	Вам назначен заказ клиента «Салимова Гулбахор» как «Мастер-замерщик»	43	f	\N	2026-08-26 23:09:50.347018+05
396	26	order_status_changed	Заказ DH-000043: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	43	f	\N	2026-08-26 23:09:50.348958+05
397	32	order_status_changed	Заказ DH-000043: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	43	f	\N	2026-08-26 23:09:50.348958+05
398	26	order_status_changed	Заказ DH-000043: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	43	f	\N	2026-08-26 23:09:50.351191+05
399	26	order_status_changed	Заказ DH-000043: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	43	f	\N	2026-08-26 23:09:50.353045+05
400	37	order_assigned	Новый заказ DH-000043	Вам назначен заказ клиента «Салимова Гулбахор» как «Швея»	43	f	\N	2026-08-26 23:09:50.355049+05
401	26	order_status_changed	Заказ DH-000043: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	43	f	\N	2026-08-26 23:09:50.357055+05
402	32	order_status_changed	Заказ DH-000043: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	43	f	\N	2026-08-26 23:09:50.357055+05
403	26	order_status_changed	Заказ DH-000043: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	43	f	\N	2026-08-26 23:09:50.359287+05
404	32	order_status_changed	Заказ DH-000043: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	43	f	\N	2026-08-26 23:09:50.359287+05
405	26	order_status_changed	Заказ DH-000043: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	43	f	\N	2026-08-26 23:09:50.361149+05
406	32	order_status_changed	Заказ DH-000043: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	43	f	\N	2026-08-26 23:09:50.361149+05
407	26	order_status_changed	Заказ DH-000043: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	43	f	\N	2026-08-26 23:09:50.363148+05
408	32	order_status_changed	Заказ DH-000043: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	43	f	\N	2026-08-26 23:09:50.363148+05
409	37	order_status_changed	Заказ DH-000043: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	43	f	\N	2026-08-26 23:09:50.363148+05
410	30	order_assigned	Новый заказ DH-000044	Вам назначен заказ клиента «Юлдашев Дониёр» как «Мастер-замерщик»	44	f	\N	2026-08-26 23:09:50.369473+05
411	26	order_status_changed	Заказ DH-000044: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	44	f	\N	2026-08-26 23:09:50.37164+05
412	30	order_status_changed	Заказ DH-000044: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	44	f	\N	2026-08-26 23:09:50.37164+05
413	26	order_status_changed	Заказ DH-000044: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	44	f	\N	2026-08-26 23:09:50.373575+05
414	26	order_status_changed	Заказ DH-000044: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	44	f	\N	2026-08-26 23:09:50.375519+05
415	37	order_assigned	Новый заказ DH-000044	Вам назначен заказ клиента «Юлдашев Дониёр» как «Швея»	44	f	\N	2026-08-26 23:09:50.377332+05
416	26	order_status_changed	Заказ DH-000044: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	44	f	\N	2026-08-26 23:09:50.379413+05
417	30	order_status_changed	Заказ DH-000044: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	44	f	\N	2026-08-26 23:09:50.379413+05
418	26	order_status_changed	Заказ DH-000044: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	44	f	\N	2026-08-26 23:09:50.381347+05
419	30	order_status_changed	Заказ DH-000044: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	44	f	\N	2026-08-26 23:09:50.381347+05
420	26	order_status_changed	Заказ DH-000044: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	44	f	\N	2026-08-26 23:09:50.383461+05
421	30	order_status_changed	Заказ DH-000044: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	44	f	\N	2026-08-26 23:09:50.383461+05
422	26	order_status_changed	Заказ DH-000044: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	44	f	\N	2026-08-26 23:09:50.385161+05
423	30	order_status_changed	Заказ DH-000044: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	44	f	\N	2026-08-26 23:09:50.385161+05
424	37	order_status_changed	Заказ DH-000044: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	44	f	\N	2026-08-26 23:09:50.385161+05
425	31	order_assigned	Новый заказ DH-000045	Вам назначен заказ клиента «Икрамова Нодира» как «Мастер-замерщик»	45	f	\N	2026-08-26 23:09:50.390407+05
426	28	order_status_changed	Заказ DH-000045: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	45	f	\N	2026-08-26 23:09:50.392432+05
427	31	order_status_changed	Заказ DH-000045: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	45	f	\N	2026-08-26 23:09:50.392432+05
428	28	order_status_changed	Заказ DH-000045: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	45	f	\N	2026-08-26 23:09:50.39481+05
429	28	order_status_changed	Заказ DH-000045: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	45	f	\N	2026-08-26 23:09:50.396834+05
430	33	order_assigned	Новый заказ DH-000045	Вам назначен заказ клиента «Икрамова Нодира» как «Швея»	45	f	\N	2026-08-26 23:09:50.398699+05
431	28	order_status_changed	Заказ DH-000045: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	45	f	\N	2026-08-26 23:09:50.400945+05
432	31	order_status_changed	Заказ DH-000045: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	45	f	\N	2026-08-26 23:09:50.400945+05
433	28	order_status_changed	Заказ DH-000045: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	45	f	\N	2026-08-26 23:09:50.40294+05
434	31	order_status_changed	Заказ DH-000045: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	45	f	\N	2026-08-26 23:09:50.40294+05
435	28	order_status_changed	Заказ DH-000045: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	45	f	\N	2026-08-26 23:09:50.405588+05
436	31	order_status_changed	Заказ DH-000045: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	45	f	\N	2026-08-26 23:09:50.405588+05
437	28	order_status_changed	Заказ DH-000045: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	45	f	\N	2026-08-26 23:09:50.408146+05
438	31	order_status_changed	Заказ DH-000045: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	45	f	\N	2026-08-26 23:09:50.408146+05
439	33	order_status_changed	Заказ DH-000045: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	45	f	\N	2026-08-26 23:09:50.408146+05
440	28	order_status_changed	Заказ DH-000045: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	45	f	\N	2026-08-26 23:09:50.410104+05
441	31	order_status_changed	Заказ DH-000045: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	45	f	\N	2026-08-26 23:09:50.410104+05
442	33	order_status_changed	Заказ DH-000045: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	45	f	\N	2026-08-26 23:09:50.410104+05
443	32	order_assigned	Новый заказ DH-000046	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Мастер-замерщик»	46	f	\N	2026-08-26 23:09:50.416972+05
444	27	order_status_changed	Заказ DH-000046: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	46	f	\N	2026-08-26 23:09:50.419454+05
445	32	order_status_changed	Заказ DH-000046: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	46	f	\N	2026-08-26 23:09:50.419454+05
446	27	order_status_changed	Заказ DH-000046: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	46	f	\N	2026-08-26 23:09:50.421527+05
447	27	order_status_changed	Заказ DH-000046: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	46	f	\N	2026-08-26 23:09:50.42343+05
448	36	order_assigned	Новый заказ DH-000046	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Швея»	46	f	\N	2026-08-26 23:09:50.425447+05
449	27	order_status_changed	Заказ DH-000046: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	46	f	\N	2026-08-26 23:09:50.42752+05
450	32	order_status_changed	Заказ DH-000046: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	46	f	\N	2026-08-26 23:09:50.42752+05
451	27	order_status_changed	Заказ DH-000046: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	46	f	\N	2026-08-26 23:09:50.429934+05
452	32	order_status_changed	Заказ DH-000046: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	46	f	\N	2026-08-26 23:09:50.429934+05
453	27	order_status_changed	Заказ DH-000046: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	46	f	\N	2026-08-26 23:09:50.43181+05
454	32	order_status_changed	Заказ DH-000046: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	46	f	\N	2026-08-26 23:09:50.43181+05
455	27	order_status_changed	Заказ DH-000046: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	46	f	\N	2026-08-26 23:09:50.43415+05
456	32	order_status_changed	Заказ DH-000046: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	46	f	\N	2026-08-26 23:09:50.43415+05
457	36	order_status_changed	Заказ DH-000046: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	46	f	\N	2026-08-26 23:09:50.43415+05
458	27	order_status_changed	Заказ DH-000046: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	46	f	\N	2026-08-26 23:09:50.43661+05
459	32	order_status_changed	Заказ DH-000046: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	46	f	\N	2026-08-26 23:09:50.43661+05
460	36	order_status_changed	Заказ DH-000046: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	46	f	\N	2026-08-26 23:09:50.43661+05
461	32	order_assigned	Новый заказ DH-000047	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Мастер-замерщик»	47	f	\N	2026-08-26 23:09:50.445233+05
462	28	order_status_changed	Заказ DH-000047: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	47	f	\N	2026-08-26 23:09:50.447365+05
463	32	order_status_changed	Заказ DH-000047: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	47	f	\N	2026-08-26 23:09:50.447365+05
464	28	order_status_changed	Заказ DH-000047: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	47	f	\N	2026-08-26 23:09:50.449102+05
465	28	order_status_changed	Заказ DH-000047: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	47	f	\N	2026-08-26 23:09:50.451054+05
466	34	order_assigned	Новый заказ DH-000047	Вам назначен заказ клиента «Юсупов Бахтиёр» как «Швея»	47	f	\N	2026-08-26 23:09:50.452714+05
467	28	order_status_changed	Заказ DH-000047: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	47	f	\N	2026-08-26 23:09:50.454952+05
468	32	order_status_changed	Заказ DH-000047: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	47	f	\N	2026-08-26 23:09:50.454952+05
469	28	order_status_changed	Заказ DH-000047: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	47	f	\N	2026-08-26 23:09:50.456738+05
470	32	order_status_changed	Заказ DH-000047: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	47	f	\N	2026-08-26 23:09:50.456738+05
471	28	order_status_changed	Заказ DH-000047: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	47	f	\N	2026-08-26 23:09:50.458791+05
472	32	order_status_changed	Заказ DH-000047: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	47	f	\N	2026-08-26 23:09:50.458791+05
473	28	order_status_changed	Заказ DH-000047: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	47	f	\N	2026-08-26 23:09:50.461253+05
474	32	order_status_changed	Заказ DH-000047: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	47	f	\N	2026-08-26 23:09:50.461253+05
475	34	order_status_changed	Заказ DH-000047: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	47	f	\N	2026-08-26 23:09:50.461253+05
476	28	order_status_changed	Заказ DH-000047: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	47	f	\N	2026-08-26 23:09:50.46431+05
477	32	order_status_changed	Заказ DH-000047: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	47	f	\N	2026-08-26 23:09:50.46431+05
478	34	order_status_changed	Заказ DH-000047: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	47	f	\N	2026-08-26 23:09:50.46431+05
479	30	order_assigned	Новый заказ DH-000048	Вам назначен заказ клиента «Тураева Мохира» как «Мастер-замерщик»	48	f	\N	2026-08-26 23:09:50.471615+05
480	28	order_status_changed	Заказ DH-000048: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	48	f	\N	2026-08-26 23:09:50.47374+05
481	30	order_status_changed	Заказ DH-000048: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	48	f	\N	2026-08-26 23:09:50.47374+05
482	28	order_status_changed	Заказ DH-000048: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	48	f	\N	2026-08-26 23:09:50.475738+05
483	28	order_status_changed	Заказ DH-000048: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	48	f	\N	2026-08-26 23:09:50.477531+05
484	34	order_assigned	Новый заказ DH-000048	Вам назначен заказ клиента «Тураева Мохира» как «Швея»	48	f	\N	2026-08-26 23:09:50.479525+05
485	28	order_status_changed	Заказ DH-000048: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	48	f	\N	2026-08-26 23:09:50.48132+05
486	30	order_status_changed	Заказ DH-000048: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	48	f	\N	2026-08-26 23:09:50.48132+05
487	28	order_status_changed	Заказ DH-000048: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	48	f	\N	2026-08-26 23:09:50.483584+05
488	30	order_status_changed	Заказ DH-000048: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	48	f	\N	2026-08-26 23:09:50.483584+05
489	28	order_status_changed	Заказ DH-000048: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	48	f	\N	2026-08-26 23:09:50.485353+05
698	42	order_completed	Заказ DH-000055: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	55	f	\N	2026-08-26 23:09:50.717701+05
490	30	order_status_changed	Заказ DH-000048: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	48	f	\N	2026-08-26 23:09:50.485353+05
491	28	order_status_changed	Заказ DH-000048: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	48	f	\N	2026-08-26 23:09:50.487587+05
492	30	order_status_changed	Заказ DH-000048: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	48	f	\N	2026-08-26 23:09:50.487587+05
493	34	order_status_changed	Заказ DH-000048: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	48	f	\N	2026-08-26 23:09:50.487587+05
494	28	order_status_changed	Заказ DH-000048: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	48	f	\N	2026-08-26 23:09:50.489504+05
495	30	order_status_changed	Заказ DH-000048: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	48	f	\N	2026-08-26 23:09:50.489504+05
496	34	order_status_changed	Заказ DH-000048: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	48	f	\N	2026-08-26 23:09:50.489504+05
497	31	order_assigned	Новый заказ DH-000049	Вам назначен заказ клиента «Юлдашев Дониёр» как «Мастер-замерщик»	49	f	\N	2026-08-26 23:09:50.496697+05
498	29	order_status_changed	Заказ DH-000049: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	49	f	\N	2026-08-26 23:09:50.498719+05
499	31	order_status_changed	Заказ DH-000049: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	49	f	\N	2026-08-26 23:09:50.498719+05
500	29	order_status_changed	Заказ DH-000049: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	49	f	\N	2026-08-26 23:09:50.50074+05
501	29	order_status_changed	Заказ DH-000049: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	49	f	\N	2026-08-26 23:09:50.502419+05
502	38	order_assigned	Новый заказ DH-000049	Вам назначен заказ клиента «Юлдашев Дониёр» как «Швея»	49	f	\N	2026-08-26 23:09:50.504271+05
503	29	order_status_changed	Заказ DH-000049: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	49	f	\N	2026-08-26 23:09:50.508707+05
504	31	order_status_changed	Заказ DH-000049: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	49	f	\N	2026-08-26 23:09:50.508707+05
505	29	order_status_changed	Заказ DH-000049: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	49	f	\N	2026-08-26 23:09:50.510577+05
506	31	order_status_changed	Заказ DH-000049: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	49	f	\N	2026-08-26 23:09:50.510577+05
507	29	order_status_changed	Заказ DH-000049: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	49	f	\N	2026-08-26 23:09:50.512603+05
508	31	order_status_changed	Заказ DH-000049: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	49	f	\N	2026-08-26 23:09:50.512603+05
509	29	order_status_changed	Заказ DH-000049: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	49	f	\N	2026-08-26 23:09:50.514667+05
510	31	order_status_changed	Заказ DH-000049: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	49	f	\N	2026-08-26 23:09:50.514667+05
511	38	order_status_changed	Заказ DH-000049: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	49	f	\N	2026-08-26 23:09:50.514667+05
512	29	order_status_changed	Заказ DH-000049: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	49	f	\N	2026-08-26 23:09:50.516785+05
513	31	order_status_changed	Заказ DH-000049: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	49	f	\N	2026-08-26 23:09:50.516785+05
514	38	order_status_changed	Заказ DH-000049: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	49	f	\N	2026-08-26 23:09:50.516785+05
515	43	order_assigned	Новый заказ DH-000049	Вам назначен заказ клиента «Юлдашев Дониёр» как «Установщик»	49	f	\N	2026-08-26 23:09:50.518964+05
516	29	order_status_changed	Заказ DH-000049: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	49	f	\N	2026-08-26 23:09:50.520925+05
517	31	order_status_changed	Заказ DH-000049: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	49	f	\N	2026-08-26 23:09:50.520925+05
518	38	order_status_changed	Заказ DH-000049: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	49	f	\N	2026-08-26 23:09:50.520925+05
519	40	order_status_changed	Заказ DH-000049: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	49	f	\N	2026-08-26 23:09:50.520925+05
520	43	order_status_changed	Заказ DH-000049: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	49	f	\N	2026-08-26 23:09:50.520925+05
521	30	order_assigned	Новый заказ DH-000050	Вам назначен заказ клиента «Раззакова Малика» как «Мастер-замерщик»	50	f	\N	2026-08-26 23:09:50.52747+05
522	26	order_status_changed	Заказ DH-000050: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	50	f	\N	2026-08-26 23:09:50.529626+05
523	30	order_status_changed	Заказ DH-000050: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	50	f	\N	2026-08-26 23:09:50.529626+05
524	26	order_status_changed	Заказ DH-000050: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	50	f	\N	2026-08-26 23:09:50.531296+05
525	26	order_status_changed	Заказ DH-000050: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	50	f	\N	2026-08-26 23:09:50.533686+05
526	38	order_assigned	Новый заказ DH-000050	Вам назначен заказ клиента «Раззакова Малика» как «Швея»	50	f	\N	2026-08-26 23:09:50.535394+05
527	26	order_status_changed	Заказ DH-000050: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	50	f	\N	2026-08-26 23:09:50.537433+05
528	30	order_status_changed	Заказ DH-000050: В пошиве	Ойша Рахимова перевёл заказ в статус «В пошиве».	50	f	\N	2026-08-26 23:09:50.537433+05
529	26	order_status_changed	Заказ DH-000050: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	50	f	\N	2026-08-26 23:09:50.53933+05
530	30	order_status_changed	Заказ DH-000050: Пошив завершён	Ойша Рахимова перевёл заказ в статус «Пошив завершён».	50	f	\N	2026-08-26 23:09:50.53933+05
531	26	order_status_changed	Заказ DH-000050: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	50	f	\N	2026-08-26 23:09:50.541323+05
532	30	order_status_changed	Заказ DH-000050: На контроле качества	Ойша Рахимова перевёл заказ в статус «На контроле качества».	50	f	\N	2026-08-26 23:09:50.541323+05
533	26	order_status_changed	Заказ DH-000050: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	50	f	\N	2026-08-26 23:09:50.543404+05
534	30	order_status_changed	Заказ DH-000050: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	50	f	\N	2026-08-26 23:09:50.543404+05
535	38	order_status_changed	Заказ DH-000050: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	50	f	\N	2026-08-26 23:09:50.543404+05
536	26	order_status_changed	Заказ DH-000050: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	50	f	\N	2026-08-26 23:09:50.545341+05
537	30	order_status_changed	Заказ DH-000050: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	50	f	\N	2026-08-26 23:09:50.545341+05
538	38	order_status_changed	Заказ DH-000050: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	50	f	\N	2026-08-26 23:09:50.545341+05
539	42	order_assigned	Новый заказ DH-000050	Вам назначен заказ клиента «Раззакова Малика» как «Установщик»	50	f	\N	2026-08-26 23:09:50.547602+05
540	26	order_status_changed	Заказ DH-000050: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	50	f	\N	2026-08-26 23:09:50.549417+05
541	30	order_status_changed	Заказ DH-000050: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	50	f	\N	2026-08-26 23:09:50.549417+05
542	38	order_status_changed	Заказ DH-000050: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	50	f	\N	2026-08-26 23:09:50.549417+05
543	40	order_status_changed	Заказ DH-000050: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	50	f	\N	2026-08-26 23:09:50.549417+05
544	42	order_status_changed	Заказ DH-000050: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	50	f	\N	2026-08-26 23:09:50.549417+05
545	30	order_assigned	Новый заказ DH-000051	Вам назначен заказ клиента «Абдуллаева Севара» как «Мастер-замерщик»	51	f	\N	2026-08-26 23:09:50.557244+05
546	29	order_status_changed	Заказ DH-000051: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	51	f	\N	2026-08-26 23:09:50.559243+05
547	30	order_status_changed	Заказ DH-000051: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	51	f	\N	2026-08-26 23:09:50.559243+05
548	29	order_status_changed	Заказ DH-000051: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	51	f	\N	2026-08-26 23:09:50.561096+05
549	29	order_status_changed	Заказ DH-000051: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	51	f	\N	2026-08-26 23:09:50.562878+05
550	36	order_assigned	Новый заказ DH-000051	Вам назначен заказ клиента «Абдуллаева Севара» как «Швея»	51	f	\N	2026-08-26 23:09:50.564747+05
551	29	order_status_changed	Заказ DH-000051: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	51	f	\N	2026-08-26 23:09:50.566518+05
552	30	order_status_changed	Заказ DH-000051: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	51	f	\N	2026-08-26 23:09:50.566518+05
553	29	order_status_changed	Заказ DH-000051: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	51	f	\N	2026-08-26 23:09:50.568548+05
554	30	order_status_changed	Заказ DH-000051: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	51	f	\N	2026-08-26 23:09:50.568548+05
555	29	order_status_changed	Заказ DH-000051: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	51	f	\N	2026-08-26 23:09:50.570276+05
556	30	order_status_changed	Заказ DH-000051: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	51	f	\N	2026-08-26 23:09:50.570276+05
557	29	order_status_changed	Заказ DH-000051: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	51	f	\N	2026-08-26 23:09:50.572422+05
558	30	order_status_changed	Заказ DH-000051: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	51	f	\N	2026-08-26 23:09:50.572422+05
559	36	order_status_changed	Заказ DH-000051: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	51	f	\N	2026-08-26 23:09:50.572422+05
560	29	order_status_changed	Заказ DH-000051: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	51	f	\N	2026-08-26 23:09:50.574502+05
561	30	order_status_changed	Заказ DH-000051: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	51	f	\N	2026-08-26 23:09:50.574502+05
562	36	order_status_changed	Заказ DH-000051: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	51	f	\N	2026-08-26 23:09:50.574502+05
563	41	order_assigned	Новый заказ DH-000051	Вам назначен заказ клиента «Абдуллаева Севара» как «Установщик»	51	f	\N	2026-08-26 23:09:50.576596+05
564	29	order_status_changed	Заказ DH-000051: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	51	f	\N	2026-08-26 23:09:50.57897+05
565	30	order_status_changed	Заказ DH-000051: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	51	f	\N	2026-08-26 23:09:50.57897+05
566	36	order_status_changed	Заказ DH-000051: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	51	f	\N	2026-08-26 23:09:50.57897+05
567	40	order_status_changed	Заказ DH-000051: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	51	f	\N	2026-08-26 23:09:50.57897+05
568	41	order_status_changed	Заказ DH-000051: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	51	f	\N	2026-08-26 23:09:50.57897+05
569	32	order_assigned	Новый заказ DH-000052	Вам назначен заказ клиента «Нурматов Шерзод» как «Мастер-замерщик»	52	f	\N	2026-08-26 23:09:50.585718+05
570	26	order_status_changed	Заказ DH-000052: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	52	f	\N	2026-08-26 23:09:50.587835+05
571	32	order_status_changed	Заказ DH-000052: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	52	f	\N	2026-08-26 23:09:50.587835+05
572	26	order_status_changed	Заказ DH-000052: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	52	f	\N	2026-08-26 23:09:50.589995+05
573	26	order_status_changed	Заказ DH-000052: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	52	f	\N	2026-08-26 23:09:50.591638+05
574	35	order_assigned	Новый заказ DH-000052	Вам назначен заказ клиента «Нурматов Шерзод» как «Швея»	52	f	\N	2026-08-26 23:09:50.593855+05
575	26	order_status_changed	Заказ DH-000052: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	52	f	\N	2026-08-26 23:09:50.595657+05
576	32	order_status_changed	Заказ DH-000052: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	52	f	\N	2026-08-26 23:09:50.595657+05
577	26	order_status_changed	Заказ DH-000052: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	52	f	\N	2026-08-26 23:09:50.597865+05
578	32	order_status_changed	Заказ DH-000052: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	52	f	\N	2026-08-26 23:09:50.597865+05
579	26	order_status_changed	Заказ DH-000052: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	52	f	\N	2026-08-26 23:09:50.599593+05
580	32	order_status_changed	Заказ DH-000052: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	52	f	\N	2026-08-26 23:09:50.599593+05
581	26	order_status_changed	Заказ DH-000052: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	52	f	\N	2026-08-26 23:09:50.60164+05
582	32	order_status_changed	Заказ DH-000052: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	52	f	\N	2026-08-26 23:09:50.60164+05
583	35	order_status_changed	Заказ DH-000052: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	52	f	\N	2026-08-26 23:09:50.60164+05
584	26	order_status_changed	Заказ DH-000052: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	52	f	\N	2026-08-26 23:09:50.603366+05
585	32	order_status_changed	Заказ DH-000052: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	52	f	\N	2026-08-26 23:09:50.603366+05
586	35	order_status_changed	Заказ DH-000052: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	52	f	\N	2026-08-26 23:09:50.603366+05
587	43	order_assigned	Новый заказ DH-000052	Вам назначен заказ клиента «Нурматов Шерзод» как «Установщик»	52	f	\N	2026-08-26 23:09:50.605373+05
588	26	order_status_changed	Заказ DH-000052: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	52	f	\N	2026-08-26 23:09:50.607486+05
589	32	order_status_changed	Заказ DH-000052: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	52	f	\N	2026-08-26 23:09:50.607486+05
590	35	order_status_changed	Заказ DH-000052: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	52	f	\N	2026-08-26 23:09:50.607486+05
591	40	order_status_changed	Заказ DH-000052: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	52	f	\N	2026-08-26 23:09:50.607486+05
592	43	order_status_changed	Заказ DH-000052: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	52	f	\N	2026-08-26 23:09:50.607486+05
593	26	order_status_changed	Заказ DH-000052: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	52	f	\N	2026-08-26 23:09:50.609353+05
594	32	order_status_changed	Заказ DH-000052: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	52	f	\N	2026-08-26 23:09:50.609353+05
595	35	order_status_changed	Заказ DH-000052: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	52	f	\N	2026-08-26 23:09:50.609353+05
596	40	order_status_changed	Заказ DH-000052: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	52	f	\N	2026-08-26 23:09:50.609353+05
597	30	order_assigned	Новый заказ DH-000053	Вам назначен заказ клиента «Собирова Гульнара» как «Мастер-замерщик»	53	f	\N	2026-08-26 23:09:50.616117+05
598	26	order_status_changed	Заказ DH-000053: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	53	f	\N	2026-08-26 23:09:50.619024+05
599	30	order_status_changed	Заказ DH-000053: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	53	f	\N	2026-08-26 23:09:50.619024+05
600	26	order_status_changed	Заказ DH-000053: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	53	f	\N	2026-08-26 23:09:50.621723+05
601	26	order_status_changed	Заказ DH-000053: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	53	f	\N	2026-08-26 23:09:50.624296+05
602	36	order_assigned	Новый заказ DH-000053	Вам назначен заказ клиента «Собирова Гульнара» как «Швея»	53	f	\N	2026-08-26 23:09:50.626364+05
603	26	order_status_changed	Заказ DH-000053: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	53	f	\N	2026-08-26 23:09:50.628332+05
604	30	order_status_changed	Заказ DH-000053: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	53	f	\N	2026-08-26 23:09:50.628332+05
605	26	order_status_changed	Заказ DH-000053: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	53	f	\N	2026-08-26 23:09:50.630267+05
606	30	order_status_changed	Заказ DH-000053: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	53	f	\N	2026-08-26 23:09:50.630267+05
607	26	order_status_changed	Заказ DH-000053: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	53	f	\N	2026-08-26 23:09:50.632008+05
608	30	order_status_changed	Заказ DH-000053: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	53	f	\N	2026-08-26 23:09:50.632008+05
609	26	order_status_changed	Заказ DH-000053: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	53	f	\N	2026-08-26 23:09:50.634266+05
610	30	order_status_changed	Заказ DH-000053: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	53	f	\N	2026-08-26 23:09:50.634266+05
611	36	order_status_changed	Заказ DH-000053: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	53	f	\N	2026-08-26 23:09:50.634266+05
612	26	order_status_changed	Заказ DH-000053: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	53	f	\N	2026-08-26 23:09:50.636358+05
613	30	order_status_changed	Заказ DH-000053: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	53	f	\N	2026-08-26 23:09:50.636358+05
614	36	order_status_changed	Заказ DH-000053: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	53	f	\N	2026-08-26 23:09:50.636358+05
615	42	order_assigned	Новый заказ DH-000053	Вам назначен заказ клиента «Собирова Гульнара» как «Установщик»	53	f	\N	2026-08-26 23:09:50.638263+05
616	26	order_status_changed	Заказ DH-000053: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	53	f	\N	2026-08-26 23:09:50.641378+05
617	30	order_status_changed	Заказ DH-000053: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	53	f	\N	2026-08-26 23:09:50.641378+05
618	36	order_status_changed	Заказ DH-000053: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	53	f	\N	2026-08-26 23:09:50.641378+05
619	39	order_status_changed	Заказ DH-000053: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	53	f	\N	2026-08-26 23:09:50.641378+05
620	42	order_status_changed	Заказ DH-000053: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	53	f	\N	2026-08-26 23:09:50.641378+05
621	26	order_status_changed	Заказ DH-000053: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	53	f	\N	2026-08-26 23:09:50.643416+05
622	30	order_status_changed	Заказ DH-000053: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	53	f	\N	2026-08-26 23:09:50.643416+05
623	36	order_status_changed	Заказ DH-000053: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	53	f	\N	2026-08-26 23:09:50.643416+05
624	39	order_status_changed	Заказ DH-000053: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	53	f	\N	2026-08-26 23:09:50.643416+05
625	30	order_assigned	Новый заказ DH-000054	Вам назначен заказ клиента «Назаров Улугбек» как «Мастер-замерщик»	54	f	\N	2026-08-26 23:09:50.651008+05
626	29	order_status_changed	Заказ DH-000054: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	54	f	\N	2026-08-26 23:09:50.652828+05
627	30	order_status_changed	Заказ DH-000054: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	54	f	\N	2026-08-26 23:09:50.652828+05
628	29	order_status_changed	Заказ DH-000054: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	54	f	\N	2026-08-26 23:09:50.655812+05
629	29	order_status_changed	Заказ DH-000054: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	54	f	\N	2026-08-26 23:09:50.657889+05
630	34	order_assigned	Новый заказ DH-000054	Вам назначен заказ клиента «Назаров Улугбек» как «Швея»	54	f	\N	2026-08-26 23:09:50.659585+05
631	29	order_status_changed	Заказ DH-000054: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	54	f	\N	2026-08-26 23:09:50.661556+05
632	30	order_status_changed	Заказ DH-000054: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	54	f	\N	2026-08-26 23:09:50.661556+05
633	29	order_status_changed	Заказ DH-000054: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	54	f	\N	2026-08-26 23:09:50.663402+05
634	30	order_status_changed	Заказ DH-000054: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	54	f	\N	2026-08-26 23:09:50.663402+05
635	29	order_status_changed	Заказ DH-000054: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	54	f	\N	2026-08-26 23:09:50.665582+05
636	30	order_status_changed	Заказ DH-000054: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	54	f	\N	2026-08-26 23:09:50.665582+05
637	29	order_status_changed	Заказ DH-000054: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	54	f	\N	2026-08-26 23:09:50.667611+05
638	30	order_status_changed	Заказ DH-000054: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	54	f	\N	2026-08-26 23:09:50.667611+05
639	34	order_status_changed	Заказ DH-000054: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	54	f	\N	2026-08-26 23:09:50.667611+05
640	29	order_status_changed	Заказ DH-000054: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	54	f	\N	2026-08-26 23:09:50.669915+05
641	30	order_status_changed	Заказ DH-000054: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	54	f	\N	2026-08-26 23:09:50.669915+05
642	34	order_status_changed	Заказ DH-000054: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	54	f	\N	2026-08-26 23:09:50.669915+05
643	41	order_assigned	Новый заказ DH-000054	Вам назначен заказ клиента «Назаров Улугбек» как «Установщик»	54	f	\N	2026-08-26 23:09:50.672147+05
644	29	order_status_changed	Заказ DH-000054: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	54	f	\N	2026-08-26 23:09:50.674284+05
645	30	order_status_changed	Заказ DH-000054: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	54	f	\N	2026-08-26 23:09:50.674284+05
646	34	order_status_changed	Заказ DH-000054: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	54	f	\N	2026-08-26 23:09:50.674284+05
647	39	order_status_changed	Заказ DH-000054: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	54	f	\N	2026-08-26 23:09:50.674284+05
648	41	order_status_changed	Заказ DH-000054: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	54	f	\N	2026-08-26 23:09:50.674284+05
649	29	order_status_changed	Заказ DH-000054: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	54	f	\N	2026-08-26 23:09:50.677133+05
650	30	order_status_changed	Заказ DH-000054: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	54	f	\N	2026-08-26 23:09:50.677133+05
651	34	order_status_changed	Заказ DH-000054: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	54	f	\N	2026-08-26 23:09:50.677133+05
652	39	order_status_changed	Заказ DH-000054: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	54	f	\N	2026-08-26 23:09:50.677133+05
653	29	order_status_changed	Заказ DH-000054: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	54	f	\N	2026-08-26 23:09:50.679402+05
654	30	order_status_changed	Заказ DH-000054: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	54	f	\N	2026-08-26 23:09:50.679402+05
655	34	order_status_changed	Заказ DH-000054: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	54	f	\N	2026-08-26 23:09:50.679402+05
656	39	order_status_changed	Заказ DH-000054: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	54	f	\N	2026-08-26 23:09:50.679402+05
657	29	order_completed	Заказ DH-000054: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	54	f	\N	2026-08-26 23:09:50.681698+05
658	30	order_completed	Заказ DH-000054: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	54	f	\N	2026-08-26 23:09:50.681698+05
659	34	order_completed	Заказ DH-000054: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	54	f	\N	2026-08-26 23:09:50.681698+05
660	39	order_completed	Заказ DH-000054: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	54	f	\N	2026-08-26 23:09:50.681698+05
661	41	order_completed	Заказ DH-000054: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	54	f	\N	2026-08-26 23:09:50.681698+05
662	32	order_assigned	Новый заказ DH-000055	Вам назначен заказ клиента «Абдуллаева Севара» как «Мастер-замерщик»	55	f	\N	2026-08-26 23:09:50.68821+05
663	28	order_status_changed	Заказ DH-000055: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	55	f	\N	2026-08-26 23:09:50.690387+05
664	32	order_status_changed	Заказ DH-000055: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	55	f	\N	2026-08-26 23:09:50.690387+05
665	28	order_status_changed	Заказ DH-000055: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	55	f	\N	2026-08-26 23:09:50.692343+05
666	28	order_status_changed	Заказ DH-000055: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	55	f	\N	2026-08-26 23:09:50.694483+05
667	36	order_assigned	Новый заказ DH-000055	Вам назначен заказ клиента «Абдуллаева Севара» как «Швея»	55	f	\N	2026-08-26 23:09:50.696169+05
668	28	order_status_changed	Заказ DH-000055: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	55	f	\N	2026-08-26 23:09:50.698539+05
669	32	order_status_changed	Заказ DH-000055: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	55	f	\N	2026-08-26 23:09:50.698539+05
670	28	order_status_changed	Заказ DH-000055: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	55	f	\N	2026-08-26 23:09:50.700444+05
671	32	order_status_changed	Заказ DH-000055: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	55	f	\N	2026-08-26 23:09:50.700444+05
672	28	order_status_changed	Заказ DH-000055: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	55	f	\N	2026-08-26 23:09:50.702359+05
673	32	order_status_changed	Заказ DH-000055: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	55	f	\N	2026-08-26 23:09:50.702359+05
674	28	order_status_changed	Заказ DH-000055: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	55	f	\N	2026-08-26 23:09:50.704553+05
675	32	order_status_changed	Заказ DH-000055: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	55	f	\N	2026-08-26 23:09:50.704553+05
676	36	order_status_changed	Заказ DH-000055: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	55	f	\N	2026-08-26 23:09:50.704553+05
677	28	order_status_changed	Заказ DH-000055: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	55	f	\N	2026-08-26 23:09:50.70642+05
678	32	order_status_changed	Заказ DH-000055: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	55	f	\N	2026-08-26 23:09:50.70642+05
679	36	order_status_changed	Заказ DH-000055: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	55	f	\N	2026-08-26 23:09:50.70642+05
680	42	order_assigned	Новый заказ DH-000055	Вам назначен заказ клиента «Абдуллаева Севара» как «Установщик»	55	f	\N	2026-08-26 23:09:50.708609+05
681	28	order_status_changed	Заказ DH-000055: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	55	f	\N	2026-08-26 23:09:50.711112+05
682	32	order_status_changed	Заказ DH-000055: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	55	f	\N	2026-08-26 23:09:50.711112+05
683	36	order_status_changed	Заказ DH-000055: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	55	f	\N	2026-08-26 23:09:50.711112+05
684	40	order_status_changed	Заказ DH-000055: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	55	f	\N	2026-08-26 23:09:50.711112+05
685	42	order_status_changed	Заказ DH-000055: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	55	f	\N	2026-08-26 23:09:50.711112+05
686	28	order_status_changed	Заказ DH-000055: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	55	f	\N	2026-08-26 23:09:50.713598+05
687	32	order_status_changed	Заказ DH-000055: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	55	f	\N	2026-08-26 23:09:50.713598+05
688	36	order_status_changed	Заказ DH-000055: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	55	f	\N	2026-08-26 23:09:50.713598+05
689	40	order_status_changed	Заказ DH-000055: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	55	f	\N	2026-08-26 23:09:50.713598+05
690	28	order_status_changed	Заказ DH-000055: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	55	f	\N	2026-08-26 23:09:50.715859+05
691	32	order_status_changed	Заказ DH-000055: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	55	f	\N	2026-08-26 23:09:50.715859+05
692	36	order_status_changed	Заказ DH-000055: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	55	f	\N	2026-08-26 23:09:50.715859+05
693	40	order_status_changed	Заказ DH-000055: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	55	f	\N	2026-08-26 23:09:50.715859+05
694	28	order_completed	Заказ DH-000055: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	55	f	\N	2026-08-26 23:09:50.717701+05
695	32	order_completed	Заказ DH-000055: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	55	f	\N	2026-08-26 23:09:50.717701+05
696	36	order_completed	Заказ DH-000055: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	55	f	\N	2026-08-26 23:09:50.717701+05
697	40	order_completed	Заказ DH-000055: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	55	f	\N	2026-08-26 23:09:50.717701+05
699	32	order_assigned	Новый заказ DH-000056	Вам назначен заказ клиента «Бекмуродов Фаррух» как «Мастер-замерщик»	56	f	\N	2026-08-26 23:09:50.724991+05
700	26	order_status_changed	Заказ DH-000056: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	56	f	\N	2026-08-26 23:09:50.727398+05
701	32	order_status_changed	Заказ DH-000056: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	56	f	\N	2026-08-26 23:09:50.727398+05
702	26	order_status_changed	Заказ DH-000056: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	56	f	\N	2026-08-26 23:09:50.729679+05
703	26	order_status_changed	Заказ DH-000056: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	56	f	\N	2026-08-26 23:09:50.731484+05
704	36	order_assigned	Новый заказ DH-000056	Вам назначен заказ клиента «Бекмуродов Фаррух» как «Швея»	56	f	\N	2026-08-26 23:09:50.733885+05
705	26	order_status_changed	Заказ DH-000056: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	56	f	\N	2026-08-26 23:09:50.736528+05
706	32	order_status_changed	Заказ DH-000056: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	56	f	\N	2026-08-26 23:09:50.736528+05
707	26	order_status_changed	Заказ DH-000056: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	56	f	\N	2026-08-26 23:09:50.738804+05
708	32	order_status_changed	Заказ DH-000056: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	56	f	\N	2026-08-26 23:09:50.738804+05
709	26	order_status_changed	Заказ DH-000056: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	56	f	\N	2026-08-26 23:09:50.741158+05
710	32	order_status_changed	Заказ DH-000056: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	56	f	\N	2026-08-26 23:09:50.741158+05
711	26	order_status_changed	Заказ DH-000056: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	56	f	\N	2026-08-26 23:09:50.743285+05
712	32	order_status_changed	Заказ DH-000056: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	56	f	\N	2026-08-26 23:09:50.743285+05
713	36	order_status_changed	Заказ DH-000056: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	56	f	\N	2026-08-26 23:09:50.743285+05
714	26	order_status_changed	Заказ DH-000056: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	56	f	\N	2026-08-26 23:09:50.745312+05
715	32	order_status_changed	Заказ DH-000056: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	56	f	\N	2026-08-26 23:09:50.745312+05
716	36	order_status_changed	Заказ DH-000056: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	56	f	\N	2026-08-26 23:09:50.745312+05
717	43	order_assigned	Новый заказ DH-000056	Вам назначен заказ клиента «Бекмуродов Фаррух» как «Установщик»	56	f	\N	2026-08-26 23:09:50.747413+05
718	26	order_status_changed	Заказ DH-000056: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	56	f	\N	2026-08-26 23:09:50.749324+05
719	32	order_status_changed	Заказ DH-000056: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	56	f	\N	2026-08-26 23:09:50.749324+05
720	36	order_status_changed	Заказ DH-000056: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	56	f	\N	2026-08-26 23:09:50.749324+05
721	39	order_status_changed	Заказ DH-000056: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	56	f	\N	2026-08-26 23:09:50.749324+05
722	43	order_status_changed	Заказ DH-000056: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	56	f	\N	2026-08-26 23:09:50.749324+05
723	26	order_status_changed	Заказ DH-000056: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	56	f	\N	2026-08-26 23:09:50.751512+05
724	32	order_status_changed	Заказ DH-000056: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	56	f	\N	2026-08-26 23:09:50.751512+05
725	36	order_status_changed	Заказ DH-000056: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	56	f	\N	2026-08-26 23:09:50.751512+05
726	39	order_status_changed	Заказ DH-000056: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	56	f	\N	2026-08-26 23:09:50.751512+05
727	26	order_status_changed	Заказ DH-000056: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	56	f	\N	2026-08-26 23:09:50.753256+05
728	32	order_status_changed	Заказ DH-000056: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	56	f	\N	2026-08-26 23:09:50.753256+05
729	36	order_status_changed	Заказ DH-000056: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	56	f	\N	2026-08-26 23:09:50.753256+05
730	39	order_status_changed	Заказ DH-000056: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	56	f	\N	2026-08-26 23:09:50.753256+05
731	26	order_completed	Заказ DH-000056: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	56	f	\N	2026-08-26 23:09:50.755508+05
732	32	order_completed	Заказ DH-000056: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	56	f	\N	2026-08-26 23:09:50.755508+05
733	36	order_completed	Заказ DH-000056: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	56	f	\N	2026-08-26 23:09:50.755508+05
734	39	order_completed	Заказ DH-000056: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	56	f	\N	2026-08-26 23:09:50.755508+05
735	43	order_completed	Заказ DH-000056: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	56	f	\N	2026-08-26 23:09:50.755508+05
736	32	order_assigned	Новый заказ DH-000057	Вам назначен заказ клиента «Юлдашев Дониёр» как «Мастер-замерщик»	57	f	\N	2026-08-26 23:09:50.763095+05
737	29	order_status_changed	Заказ DH-000057: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	57	f	\N	2026-08-26 23:09:50.765133+05
738	32	order_status_changed	Заказ DH-000057: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	57	f	\N	2026-08-26 23:09:50.765133+05
739	29	order_status_changed	Заказ DH-000057: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	57	f	\N	2026-08-26 23:09:50.766972+05
740	29	order_status_changed	Заказ DH-000057: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	57	f	\N	2026-08-26 23:09:50.769013+05
741	36	order_assigned	Новый заказ DH-000057	Вам назначен заказ клиента «Юлдашев Дониёр» как «Швея»	57	f	\N	2026-08-26 23:09:50.770684+05
742	29	order_status_changed	Заказ DH-000057: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	57	f	\N	2026-08-26 23:09:50.772744+05
743	32	order_status_changed	Заказ DH-000057: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	57	f	\N	2026-08-26 23:09:50.772744+05
744	29	order_status_changed	Заказ DH-000057: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	57	f	\N	2026-08-26 23:09:50.774372+05
745	32	order_status_changed	Заказ DH-000057: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	57	f	\N	2026-08-26 23:09:50.774372+05
746	29	order_status_changed	Заказ DH-000057: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	57	f	\N	2026-08-26 23:09:50.77644+05
747	32	order_status_changed	Заказ DH-000057: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	57	f	\N	2026-08-26 23:09:50.77644+05
748	29	order_status_changed	Заказ DH-000057: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	57	f	\N	2026-08-26 23:09:50.778284+05
749	32	order_status_changed	Заказ DH-000057: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	57	f	\N	2026-08-26 23:09:50.778284+05
750	36	order_status_changed	Заказ DH-000057: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	57	f	\N	2026-08-26 23:09:50.778284+05
751	29	order_status_changed	Заказ DH-000057: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	57	f	\N	2026-08-26 23:09:50.780316+05
752	32	order_status_changed	Заказ DH-000057: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	57	f	\N	2026-08-26 23:09:50.780316+05
753	36	order_status_changed	Заказ DH-000057: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	57	f	\N	2026-08-26 23:09:50.780316+05
754	41	order_assigned	Новый заказ DH-000057	Вам назначен заказ клиента «Юлдашев Дониёр» как «Установщик»	57	f	\N	2026-08-26 23:09:50.782095+05
755	29	order_status_changed	Заказ DH-000057: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	57	f	\N	2026-08-26 23:09:50.78431+05
756	32	order_status_changed	Заказ DH-000057: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	57	f	\N	2026-08-26 23:09:50.78431+05
757	36	order_status_changed	Заказ DH-000057: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	57	f	\N	2026-08-26 23:09:50.78431+05
758	39	order_status_changed	Заказ DH-000057: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	57	f	\N	2026-08-26 23:09:50.78431+05
759	41	order_status_changed	Заказ DH-000057: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	57	f	\N	2026-08-26 23:09:50.78431+05
760	29	order_status_changed	Заказ DH-000057: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	57	f	\N	2026-08-26 23:09:50.786582+05
761	32	order_status_changed	Заказ DH-000057: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	57	f	\N	2026-08-26 23:09:50.786582+05
762	36	order_status_changed	Заказ DH-000057: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	57	f	\N	2026-08-26 23:09:50.786582+05
763	39	order_status_changed	Заказ DH-000057: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	57	f	\N	2026-08-26 23:09:50.786582+05
764	29	order_status_changed	Заказ DH-000057: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	57	f	\N	2026-08-26 23:09:50.788457+05
765	32	order_status_changed	Заказ DH-000057: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	57	f	\N	2026-08-26 23:09:50.788457+05
766	36	order_status_changed	Заказ DH-000057: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	57	f	\N	2026-08-26 23:09:50.788457+05
767	39	order_status_changed	Заказ DH-000057: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	57	f	\N	2026-08-26 23:09:50.788457+05
768	29	order_completed	Заказ DH-000057: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	57	f	\N	2026-08-26 23:09:50.791004+05
769	32	order_completed	Заказ DH-000057: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	57	f	\N	2026-08-26 23:09:50.791004+05
770	36	order_completed	Заказ DH-000057: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	57	f	\N	2026-08-26 23:09:50.791004+05
771	39	order_completed	Заказ DH-000057: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	57	f	\N	2026-08-26 23:09:50.791004+05
772	41	order_completed	Заказ DH-000057: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	57	f	\N	2026-08-26 23:09:50.791004+05
773	32	order_assigned	Новый заказ DH-000058	Вам назначен заказ клиента «Рахмонов Икром» как «Мастер-замерщик»	58	f	\N	2026-08-26 23:09:50.79735+05
774	26	order_status_changed	Заказ DH-000058: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	58	f	\N	2026-08-26 23:09:50.799179+05
775	32	order_status_changed	Заказ DH-000058: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	58	f	\N	2026-08-26 23:09:50.799179+05
776	26	order_status_changed	Заказ DH-000058: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	58	f	\N	2026-08-26 23:09:50.801428+05
777	26	order_status_changed	Заказ DH-000058: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	58	f	\N	2026-08-26 23:09:50.80331+05
778	34	order_assigned	Новый заказ DH-000058	Вам назначен заказ клиента «Рахмонов Икром» как «Швея»	58	f	\N	2026-08-26 23:09:50.805326+05
779	26	order_status_changed	Заказ DH-000058: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	58	f	\N	2026-08-26 23:09:50.80751+05
780	32	order_status_changed	Заказ DH-000058: В пошиве	Гулнора Сайфиева перевёл заказ в статус «В пошиве».	58	f	\N	2026-08-26 23:09:50.80751+05
781	26	order_status_changed	Заказ DH-000058: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	58	f	\N	2026-08-26 23:09:50.809479+05
782	32	order_status_changed	Заказ DH-000058: Пошив завершён	Гулнора Сайфиева перевёл заказ в статус «Пошив завершён».	58	f	\N	2026-08-26 23:09:50.809479+05
783	26	order_status_changed	Заказ DH-000058: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	58	f	\N	2026-08-26 23:09:50.811487+05
784	32	order_status_changed	Заказ DH-000058: На контроле качества	Гулнора Сайфиева перевёл заказ в статус «На контроле качества».	58	f	\N	2026-08-26 23:09:50.811487+05
785	26	order_status_changed	Заказ DH-000058: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	58	f	\N	2026-08-26 23:09:50.813343+05
786	32	order_status_changed	Заказ DH-000058: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	58	f	\N	2026-08-26 23:09:50.813343+05
787	34	order_status_changed	Заказ DH-000058: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	58	f	\N	2026-08-26 23:09:50.813343+05
788	26	order_status_changed	Заказ DH-000058: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	58	f	\N	2026-08-26 23:09:50.815986+05
789	32	order_status_changed	Заказ DH-000058: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	58	f	\N	2026-08-26 23:09:50.815986+05
790	34	order_status_changed	Заказ DH-000058: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	58	f	\N	2026-08-26 23:09:50.815986+05
791	41	order_assigned	Новый заказ DH-000058	Вам назначен заказ клиента «Рахмонов Икром» как «Установщик»	58	f	\N	2026-08-26 23:09:50.817929+05
792	26	order_status_changed	Заказ DH-000058: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	58	f	\N	2026-08-26 23:09:50.822303+05
793	32	order_status_changed	Заказ DH-000058: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	58	f	\N	2026-08-26 23:09:50.822303+05
794	34	order_status_changed	Заказ DH-000058: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	58	f	\N	2026-08-26 23:09:50.822303+05
795	39	order_status_changed	Заказ DH-000058: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	58	f	\N	2026-08-26 23:09:50.822303+05
796	41	order_status_changed	Заказ DH-000058: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	58	f	\N	2026-08-26 23:09:50.822303+05
797	26	order_status_changed	Заказ DH-000058: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	58	f	\N	2026-08-26 23:09:50.824536+05
798	32	order_status_changed	Заказ DH-000058: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	58	f	\N	2026-08-26 23:09:50.824536+05
799	34	order_status_changed	Заказ DH-000058: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	58	f	\N	2026-08-26 23:09:50.824536+05
800	39	order_status_changed	Заказ DH-000058: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	58	f	\N	2026-08-26 23:09:50.824536+05
801	26	order_status_changed	Заказ DH-000058: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	58	f	\N	2026-08-26 23:09:50.826847+05
802	32	order_status_changed	Заказ DH-000058: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	58	f	\N	2026-08-26 23:09:50.826847+05
803	34	order_status_changed	Заказ DH-000058: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	58	f	\N	2026-08-26 23:09:50.826847+05
804	39	order_status_changed	Заказ DH-000058: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	58	f	\N	2026-08-26 23:09:50.826847+05
805	26	order_completed	Заказ DH-000058: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	58	f	\N	2026-08-26 23:09:50.828944+05
806	32	order_completed	Заказ DH-000058: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	58	f	\N	2026-08-26 23:09:50.828944+05
807	34	order_completed	Заказ DH-000058: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	58	f	\N	2026-08-26 23:09:50.828944+05
808	39	order_completed	Заказ DH-000058: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	58	f	\N	2026-08-26 23:09:50.828944+05
809	41	order_completed	Заказ DH-000058: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	58	f	\N	2026-08-26 23:09:50.828944+05
810	30	order_assigned	Новый заказ DH-000059	Вам назначен заказ клиента «Мирзоева Феруза» как «Мастер-замерщик»	59	f	\N	2026-08-26 23:09:50.836451+05
811	28	order_status_changed	Заказ DH-000059: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	59	f	\N	2026-08-26 23:09:50.838525+05
812	30	order_status_changed	Заказ DH-000059: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	59	f	\N	2026-08-26 23:09:50.838525+05
813	28	order_status_changed	Заказ DH-000059: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	59	f	\N	2026-08-26 23:09:50.840564+05
814	28	order_status_changed	Заказ DH-000059: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	59	f	\N	2026-08-26 23:09:50.84244+05
815	33	order_assigned	Новый заказ DH-000059	Вам назначен заказ клиента «Мирзоева Феруза» как «Швея»	59	f	\N	2026-08-26 23:09:50.844529+05
816	28	order_status_changed	Заказ DH-000059: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	59	f	\N	2026-08-26 23:09:50.84658+05
817	30	order_status_changed	Заказ DH-000059: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	59	f	\N	2026-08-26 23:09:50.84658+05
818	28	order_status_changed	Заказ DH-000059: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	59	f	\N	2026-08-26 23:09:50.848682+05
819	30	order_status_changed	Заказ DH-000059: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	59	f	\N	2026-08-26 23:09:50.848682+05
820	28	order_status_changed	Заказ DH-000059: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	59	f	\N	2026-08-26 23:09:50.850772+05
821	30	order_status_changed	Заказ DH-000059: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	59	f	\N	2026-08-26 23:09:50.850772+05
822	28	order_status_changed	Заказ DH-000059: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	59	f	\N	2026-08-26 23:09:50.85272+05
823	30	order_status_changed	Заказ DH-000059: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	59	f	\N	2026-08-26 23:09:50.85272+05
824	33	order_status_changed	Заказ DH-000059: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	59	f	\N	2026-08-26 23:09:50.85272+05
825	28	order_status_changed	Заказ DH-000059: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	59	f	\N	2026-08-26 23:09:50.854859+05
826	30	order_status_changed	Заказ DH-000059: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	59	f	\N	2026-08-26 23:09:50.854859+05
827	33	order_status_changed	Заказ DH-000059: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	59	f	\N	2026-08-26 23:09:50.854859+05
828	43	order_assigned	Новый заказ DH-000059	Вам назначен заказ клиента «Мирзоева Феруза» как «Установщик»	59	f	\N	2026-08-26 23:09:50.856654+05
829	28	order_status_changed	Заказ DH-000059: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	59	f	\N	2026-08-26 23:09:50.858899+05
830	30	order_status_changed	Заказ DH-000059: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	59	f	\N	2026-08-26 23:09:50.858899+05
831	33	order_status_changed	Заказ DH-000059: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	59	f	\N	2026-08-26 23:09:50.858899+05
832	40	order_status_changed	Заказ DH-000059: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	59	f	\N	2026-08-26 23:09:50.858899+05
833	43	order_status_changed	Заказ DH-000059: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	59	f	\N	2026-08-26 23:09:50.858899+05
834	28	order_status_changed	Заказ DH-000059: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	59	f	\N	2026-08-26 23:09:50.86084+05
835	30	order_status_changed	Заказ DH-000059: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	59	f	\N	2026-08-26 23:09:50.86084+05
836	33	order_status_changed	Заказ DH-000059: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	59	f	\N	2026-08-26 23:09:50.86084+05
837	40	order_status_changed	Заказ DH-000059: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	59	f	\N	2026-08-26 23:09:50.86084+05
838	28	order_status_changed	Заказ DH-000059: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	59	f	\N	2026-08-26 23:09:50.862912+05
839	30	order_status_changed	Заказ DH-000059: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	59	f	\N	2026-08-26 23:09:50.862912+05
840	33	order_status_changed	Заказ DH-000059: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	59	f	\N	2026-08-26 23:09:50.862912+05
841	40	order_status_changed	Заказ DH-000059: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	59	f	\N	2026-08-26 23:09:50.862912+05
842	28	order_completed	Заказ DH-000059: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	59	f	\N	2026-08-26 23:09:50.86491+05
843	30	order_completed	Заказ DH-000059: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	59	f	\N	2026-08-26 23:09:50.86491+05
844	33	order_completed	Заказ DH-000059: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	59	f	\N	2026-08-26 23:09:50.86491+05
845	40	order_completed	Заказ DH-000059: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	59	f	\N	2026-08-26 23:09:50.86491+05
846	43	order_completed	Заказ DH-000059: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	59	f	\N	2026-08-26 23:09:50.86491+05
847	30	order_assigned	Новый заказ DH-000060	Вам назначен заказ клиента «Назаров Улугбек» как «Мастер-замерщик»	60	f	\N	2026-08-26 23:09:50.870742+05
848	28	order_status_changed	Заказ DH-000060: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	60	f	\N	2026-08-26 23:09:50.87325+05
849	30	order_status_changed	Заказ DH-000060: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	60	f	\N	2026-08-26 23:09:50.87325+05
850	28	order_status_changed	Заказ DH-000060: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	60	f	\N	2026-08-26 23:09:50.876044+05
851	28	order_status_changed	Заказ DH-000060: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	60	f	\N	2026-08-26 23:09:50.87792+05
852	36	order_assigned	Новый заказ DH-000060	Вам назначен заказ клиента «Назаров Улугбек» как «Швея»	60	f	\N	2026-08-26 23:09:50.88+05
853	28	order_status_changed	Заказ DH-000060: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	60	f	\N	2026-08-26 23:09:50.88179+05
854	30	order_status_changed	Заказ DH-000060: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	60	f	\N	2026-08-26 23:09:50.88179+05
855	28	order_status_changed	Заказ DH-000060: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	60	f	\N	2026-08-26 23:09:50.884002+05
856	30	order_status_changed	Заказ DH-000060: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	60	f	\N	2026-08-26 23:09:50.884002+05
857	28	order_status_changed	Заказ DH-000060: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	60	f	\N	2026-08-26 23:09:50.885773+05
858	30	order_status_changed	Заказ DH-000060: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	60	f	\N	2026-08-26 23:09:50.885773+05
859	28	order_status_changed	Заказ DH-000060: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	60	f	\N	2026-08-26 23:09:50.887884+05
860	30	order_status_changed	Заказ DH-000060: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	60	f	\N	2026-08-26 23:09:50.887884+05
861	36	order_status_changed	Заказ DH-000060: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	60	f	\N	2026-08-26 23:09:50.887884+05
862	28	order_status_changed	Заказ DH-000060: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	60	f	\N	2026-08-26 23:09:50.889972+05
863	30	order_status_changed	Заказ DH-000060: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	60	f	\N	2026-08-26 23:09:50.889972+05
864	36	order_status_changed	Заказ DH-000060: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	60	f	\N	2026-08-26 23:09:50.889972+05
865	42	order_assigned	Новый заказ DH-000060	Вам назначен заказ клиента «Назаров Улугбек» как «Установщик»	60	f	\N	2026-08-26 23:09:50.891708+05
866	28	order_status_changed	Заказ DH-000060: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	60	f	\N	2026-08-26 23:09:50.893938+05
867	30	order_status_changed	Заказ DH-000060: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	60	f	\N	2026-08-26 23:09:50.893938+05
868	36	order_status_changed	Заказ DH-000060: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	60	f	\N	2026-08-26 23:09:50.893938+05
869	39	order_status_changed	Заказ DH-000060: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	60	f	\N	2026-08-26 23:09:50.893938+05
870	42	order_status_changed	Заказ DH-000060: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	60	f	\N	2026-08-26 23:09:50.893938+05
871	28	order_status_changed	Заказ DH-000060: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	60	f	\N	2026-08-26 23:09:50.895985+05
872	30	order_status_changed	Заказ DH-000060: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	60	f	\N	2026-08-26 23:09:50.895985+05
873	36	order_status_changed	Заказ DH-000060: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	60	f	\N	2026-08-26 23:09:50.895985+05
874	39	order_status_changed	Заказ DH-000060: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	60	f	\N	2026-08-26 23:09:50.895985+05
875	28	order_status_changed	Заказ DH-000060: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	60	f	\N	2026-08-26 23:09:50.898553+05
876	30	order_status_changed	Заказ DH-000060: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	60	f	\N	2026-08-26 23:09:50.898553+05
877	36	order_status_changed	Заказ DH-000060: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	60	f	\N	2026-08-26 23:09:50.898553+05
878	39	order_status_changed	Заказ DH-000060: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	60	f	\N	2026-08-26 23:09:50.898553+05
879	28	order_completed	Заказ DH-000060: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	60	f	\N	2026-08-26 23:09:50.900672+05
880	30	order_completed	Заказ DH-000060: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	60	f	\N	2026-08-26 23:09:50.900672+05
881	36	order_completed	Заказ DH-000060: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	60	f	\N	2026-08-26 23:09:50.900672+05
882	39	order_completed	Заказ DH-000060: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	60	f	\N	2026-08-26 23:09:50.900672+05
883	42	order_completed	Заказ DH-000060: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	60	f	\N	2026-08-26 23:09:50.900672+05
884	30	order_assigned	Новый заказ DH-000061	Вам назначен заказ клиента «Салимова Гулбахор» как «Мастер-замерщик»	61	f	\N	2026-08-26 23:09:50.907583+05
885	27	order_status_changed	Заказ DH-000061: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	61	f	\N	2026-08-26 23:09:50.909591+05
886	30	order_status_changed	Заказ DH-000061: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	61	f	\N	2026-08-26 23:09:50.909591+05
887	27	order_status_changed	Заказ DH-000061: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	61	f	\N	2026-08-26 23:09:50.911577+05
888	27	order_status_changed	Заказ DH-000061: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	61	f	\N	2026-08-26 23:09:50.913273+05
889	35	order_assigned	Новый заказ DH-000061	Вам назначен заказ клиента «Салимова Гулбахор» как «Швея»	61	f	\N	2026-08-26 23:09:50.915298+05
890	27	order_status_changed	Заказ DH-000061: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	61	f	\N	2026-08-26 23:09:50.917334+05
891	30	order_status_changed	Заказ DH-000061: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	61	f	\N	2026-08-26 23:09:50.917334+05
892	27	order_status_changed	Заказ DH-000061: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	61	f	\N	2026-08-26 23:09:50.919392+05
893	30	order_status_changed	Заказ DH-000061: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	61	f	\N	2026-08-26 23:09:50.919392+05
894	27	order_status_changed	Заказ DH-000061: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	61	f	\N	2026-08-26 23:09:50.921015+05
895	30	order_status_changed	Заказ DH-000061: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	61	f	\N	2026-08-26 23:09:50.921015+05
896	27	order_status_changed	Заказ DH-000061: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	61	f	\N	2026-08-26 23:09:50.922977+05
897	30	order_status_changed	Заказ DH-000061: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	61	f	\N	2026-08-26 23:09:50.922977+05
898	35	order_status_changed	Заказ DH-000061: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	61	f	\N	2026-08-26 23:09:50.922977+05
899	27	order_status_changed	Заказ DH-000061: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	61	f	\N	2026-08-26 23:09:50.924715+05
900	30	order_status_changed	Заказ DH-000061: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	61	f	\N	2026-08-26 23:09:50.924715+05
901	35	order_status_changed	Заказ DH-000061: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	61	f	\N	2026-08-26 23:09:50.924715+05
902	43	order_assigned	Новый заказ DH-000061	Вам назначен заказ клиента «Салимова Гулбахор» как «Установщик»	61	f	\N	2026-08-26 23:09:50.927132+05
903	27	order_status_changed	Заказ DH-000061: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	61	f	\N	2026-08-26 23:09:50.929357+05
904	30	order_status_changed	Заказ DH-000061: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	61	f	\N	2026-08-26 23:09:50.929357+05
905	35	order_status_changed	Заказ DH-000061: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	61	f	\N	2026-08-26 23:09:50.929357+05
906	40	order_status_changed	Заказ DH-000061: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	61	f	\N	2026-08-26 23:09:50.929357+05
907	43	order_status_changed	Заказ DH-000061: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	61	f	\N	2026-08-26 23:09:50.929357+05
908	27	order_status_changed	Заказ DH-000061: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	61	f	\N	2026-08-26 23:09:50.931372+05
909	30	order_status_changed	Заказ DH-000061: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	61	f	\N	2026-08-26 23:09:50.931372+05
910	35	order_status_changed	Заказ DH-000061: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	61	f	\N	2026-08-26 23:09:50.931372+05
911	40	order_status_changed	Заказ DH-000061: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	61	f	\N	2026-08-26 23:09:50.931372+05
912	27	order_status_changed	Заказ DH-000061: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	61	f	\N	2026-08-26 23:09:50.933507+05
913	30	order_status_changed	Заказ DH-000061: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	61	f	\N	2026-08-26 23:09:50.933507+05
914	35	order_status_changed	Заказ DH-000061: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	61	f	\N	2026-08-26 23:09:50.933507+05
915	40	order_status_changed	Заказ DH-000061: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	61	f	\N	2026-08-26 23:09:50.933507+05
916	27	order_completed	Заказ DH-000061: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	61	f	\N	2026-08-26 23:09:50.935244+05
917	30	order_completed	Заказ DH-000061: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	61	f	\N	2026-08-26 23:09:50.935244+05
918	35	order_completed	Заказ DH-000061: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	61	f	\N	2026-08-26 23:09:50.935244+05
919	40	order_completed	Заказ DH-000061: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	61	f	\N	2026-08-26 23:09:50.935244+05
920	43	order_completed	Заказ DH-000061: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	61	f	\N	2026-08-26 23:09:50.935244+05
921	31	order_assigned	Новый заказ DH-000062	Вам назначен заказ клиента «Салимова Гулбахор» как «Мастер-замерщик»	62	f	\N	2026-08-26 23:09:50.941857+05
922	27	order_status_changed	Заказ DH-000062: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	62	f	\N	2026-08-26 23:09:50.943902+05
923	31	order_status_changed	Заказ DH-000062: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	62	f	\N	2026-08-26 23:09:50.943902+05
924	27	order_status_changed	Заказ DH-000062: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	62	f	\N	2026-08-26 23:09:50.945793+05
925	27	order_status_changed	Заказ DH-000062: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	62	f	\N	2026-08-26 23:09:50.948102+05
926	33	order_assigned	Новый заказ DH-000062	Вам назначен заказ клиента «Салимова Гулбахор» как «Швея»	62	f	\N	2026-08-26 23:09:50.949693+05
927	27	order_status_changed	Заказ DH-000062: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	62	f	\N	2026-08-26 23:09:50.95202+05
928	31	order_status_changed	Заказ DH-000062: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	62	f	\N	2026-08-26 23:09:50.95202+05
929	27	order_status_changed	Заказ DH-000062: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	62	f	\N	2026-08-26 23:09:50.953817+05
930	31	order_status_changed	Заказ DH-000062: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	62	f	\N	2026-08-26 23:09:50.953817+05
931	27	order_status_changed	Заказ DH-000062: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	62	f	\N	2026-08-26 23:09:50.955701+05
932	31	order_status_changed	Заказ DH-000062: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	62	f	\N	2026-08-26 23:09:50.955701+05
933	27	order_status_changed	Заказ DH-000062: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	62	f	\N	2026-08-26 23:09:50.957783+05
934	31	order_status_changed	Заказ DH-000062: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	62	f	\N	2026-08-26 23:09:50.957783+05
935	33	order_status_changed	Заказ DH-000062: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	62	f	\N	2026-08-26 23:09:50.957783+05
936	27	order_status_changed	Заказ DH-000062: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	62	f	\N	2026-08-26 23:09:50.959916+05
937	31	order_status_changed	Заказ DH-000062: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	62	f	\N	2026-08-26 23:09:50.959916+05
938	33	order_status_changed	Заказ DH-000062: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	62	f	\N	2026-08-26 23:09:50.959916+05
939	43	order_assigned	Новый заказ DH-000062	Вам назначен заказ клиента «Салимова Гулбахор» как «Установщик»	62	f	\N	2026-08-26 23:09:50.962151+05
940	27	order_status_changed	Заказ DH-000062: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	62	f	\N	2026-08-26 23:09:50.963984+05
941	31	order_status_changed	Заказ DH-000062: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	62	f	\N	2026-08-26 23:09:50.963984+05
942	33	order_status_changed	Заказ DH-000062: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	62	f	\N	2026-08-26 23:09:50.963984+05
943	40	order_status_changed	Заказ DH-000062: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	62	f	\N	2026-08-26 23:09:50.963984+05
944	43	order_status_changed	Заказ DH-000062: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	62	f	\N	2026-08-26 23:09:50.963984+05
945	27	order_status_changed	Заказ DH-000062: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	62	f	\N	2026-08-26 23:09:50.966369+05
946	31	order_status_changed	Заказ DH-000062: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	62	f	\N	2026-08-26 23:09:50.966369+05
947	33	order_status_changed	Заказ DH-000062: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	62	f	\N	2026-08-26 23:09:50.966369+05
948	40	order_status_changed	Заказ DH-000062: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	62	f	\N	2026-08-26 23:09:50.966369+05
949	27	order_status_changed	Заказ DH-000062: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	62	f	\N	2026-08-26 23:09:50.968449+05
950	31	order_status_changed	Заказ DH-000062: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	62	f	\N	2026-08-26 23:09:50.968449+05
951	33	order_status_changed	Заказ DH-000062: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	62	f	\N	2026-08-26 23:09:50.968449+05
952	40	order_status_changed	Заказ DH-000062: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	62	f	\N	2026-08-26 23:09:50.968449+05
953	27	order_completed	Заказ DH-000062: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	62	f	\N	2026-08-26 23:09:50.97038+05
954	31	order_completed	Заказ DH-000062: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	62	f	\N	2026-08-26 23:09:50.97038+05
955	33	order_completed	Заказ DH-000062: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	62	f	\N	2026-08-26 23:09:50.97038+05
956	40	order_completed	Заказ DH-000062: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	62	f	\N	2026-08-26 23:09:50.97038+05
957	43	order_completed	Заказ DH-000062: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	62	f	\N	2026-08-26 23:09:50.97038+05
958	30	order_assigned	Новый заказ DH-000063	Вам назначен заказ клиента «Рахмонов Икром» как «Мастер-замерщик»	63	f	\N	2026-08-26 23:09:50.976226+05
959	27	order_status_changed	Заказ DH-000063: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	63	f	\N	2026-08-26 23:09:50.978201+05
960	30	order_status_changed	Заказ DH-000063: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	63	f	\N	2026-08-26 23:09:50.978201+05
961	27	order_status_changed	Заказ DH-000063: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	63	f	\N	2026-08-26 23:09:50.980788+05
962	27	order_status_changed	Заказ DH-000063: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	63	f	\N	2026-08-26 23:09:50.983229+05
963	35	order_assigned	Новый заказ DH-000063	Вам назначен заказ клиента «Рахмонов Икром» как «Швея»	63	f	\N	2026-08-26 23:09:50.98504+05
964	27	order_status_changed	Заказ DH-000063: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	63	f	\N	2026-08-26 23:09:50.987324+05
965	30	order_status_changed	Заказ DH-000063: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	63	f	\N	2026-08-26 23:09:50.987324+05
966	27	order_status_changed	Заказ DH-000063: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	63	f	\N	2026-08-26 23:09:50.989076+05
967	30	order_status_changed	Заказ DH-000063: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	63	f	\N	2026-08-26 23:09:50.989076+05
968	27	order_status_changed	Заказ DH-000063: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	63	f	\N	2026-08-26 23:09:50.991136+05
969	30	order_status_changed	Заказ DH-000063: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	63	f	\N	2026-08-26 23:09:50.991136+05
970	27	order_status_changed	Заказ DH-000063: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	63	f	\N	2026-08-26 23:09:50.992911+05
971	30	order_status_changed	Заказ DH-000063: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	63	f	\N	2026-08-26 23:09:50.992911+05
972	35	order_status_changed	Заказ DH-000063: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	63	f	\N	2026-08-26 23:09:50.992911+05
973	27	order_status_changed	Заказ DH-000063: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	63	f	\N	2026-08-26 23:09:50.994976+05
974	30	order_status_changed	Заказ DH-000063: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	63	f	\N	2026-08-26 23:09:50.994976+05
975	35	order_status_changed	Заказ DH-000063: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	63	f	\N	2026-08-26 23:09:50.994976+05
976	41	order_assigned	Новый заказ DH-000063	Вам назначен заказ клиента «Рахмонов Икром» как «Установщик»	63	f	\N	2026-08-26 23:09:50.997009+05
977	27	order_status_changed	Заказ DH-000063: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	63	f	\N	2026-08-26 23:09:50.998882+05
978	30	order_status_changed	Заказ DH-000063: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	63	f	\N	2026-08-26 23:09:50.998882+05
979	35	order_status_changed	Заказ DH-000063: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	63	f	\N	2026-08-26 23:09:50.998882+05
980	39	order_status_changed	Заказ DH-000063: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	63	f	\N	2026-08-26 23:09:50.998882+05
981	41	order_status_changed	Заказ DH-000063: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	63	f	\N	2026-08-26 23:09:50.998882+05
982	27	order_status_changed	Заказ DH-000063: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	63	f	\N	2026-08-26 23:09:51.001067+05
983	30	order_status_changed	Заказ DH-000063: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	63	f	\N	2026-08-26 23:09:51.001067+05
984	35	order_status_changed	Заказ DH-000063: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	63	f	\N	2026-08-26 23:09:51.001067+05
985	39	order_status_changed	Заказ DH-000063: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	63	f	\N	2026-08-26 23:09:51.001067+05
986	27	order_status_changed	Заказ DH-000063: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	63	f	\N	2026-08-26 23:09:51.003357+05
987	30	order_status_changed	Заказ DH-000063: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	63	f	\N	2026-08-26 23:09:51.003357+05
988	35	order_status_changed	Заказ DH-000063: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	63	f	\N	2026-08-26 23:09:51.003357+05
989	39	order_status_changed	Заказ DH-000063: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	63	f	\N	2026-08-26 23:09:51.003357+05
990	27	order_completed	Заказ DH-000063: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	63	f	\N	2026-08-26 23:09:51.005916+05
991	30	order_completed	Заказ DH-000063: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	63	f	\N	2026-08-26 23:09:51.005916+05
992	35	order_completed	Заказ DH-000063: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	63	f	\N	2026-08-26 23:09:51.005916+05
993	39	order_completed	Заказ DH-000063: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	63	f	\N	2026-08-26 23:09:51.005916+05
994	41	order_completed	Заказ DH-000063: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	63	f	\N	2026-08-26 23:09:51.005916+05
995	31	order_assigned	Новый заказ DH-000064	Вам назначен заказ клиента «Раззакова Малика» как «Мастер-замерщик»	64	f	\N	2026-08-26 23:09:51.012793+05
996	29	order_status_changed	Заказ DH-000064: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	64	f	\N	2026-08-26 23:09:51.014682+05
997	31	order_status_changed	Заказ DH-000064: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	64	f	\N	2026-08-26 23:09:51.014682+05
998	29	order_status_changed	Заказ DH-000064: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	64	f	\N	2026-08-26 23:09:51.016555+05
999	29	order_status_changed	Заказ DH-000064: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	64	f	\N	2026-08-26 23:09:51.018467+05
1000	37	order_assigned	Новый заказ DH-000064	Вам назначен заказ клиента «Раззакова Малика» как «Швея»	64	f	\N	2026-08-26 23:09:51.020224+05
1001	29	order_status_changed	Заказ DH-000064: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	64	f	\N	2026-08-26 23:09:51.02243+05
1002	31	order_status_changed	Заказ DH-000064: В пошиве	Мадина Юлдашева перевёл заказ в статус «В пошиве».	64	f	\N	2026-08-26 23:09:51.02243+05
1003	29	order_status_changed	Заказ DH-000064: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	64	f	\N	2026-08-26 23:09:51.02432+05
1004	31	order_status_changed	Заказ DH-000064: Пошив завершён	Мадина Юлдашева перевёл заказ в статус «Пошив завершён».	64	f	\N	2026-08-26 23:09:51.02432+05
1005	29	order_status_changed	Заказ DH-000064: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	64	f	\N	2026-08-26 23:09:51.026997+05
1006	31	order_status_changed	Заказ DH-000064: На контроле качества	Мадина Юлдашева перевёл заказ в статус «На контроле качества».	64	f	\N	2026-08-26 23:09:51.026997+05
1007	29	order_status_changed	Заказ DH-000064: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	64	f	\N	2026-08-26 23:09:51.029212+05
1008	31	order_status_changed	Заказ DH-000064: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	64	f	\N	2026-08-26 23:09:51.029212+05
1009	37	order_status_changed	Заказ DH-000064: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	64	f	\N	2026-08-26 23:09:51.029212+05
1010	29	order_status_changed	Заказ DH-000064: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	64	f	\N	2026-08-26 23:09:51.031493+05
1011	31	order_status_changed	Заказ DH-000064: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	64	f	\N	2026-08-26 23:09:51.031493+05
1012	37	order_status_changed	Заказ DH-000064: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	64	f	\N	2026-08-26 23:09:51.031493+05
1013	43	order_assigned	Новый заказ DH-000064	Вам назначен заказ клиента «Раззакова Малика» как «Установщик»	64	f	\N	2026-08-26 23:09:51.033663+05
1014	29	order_status_changed	Заказ DH-000064: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	64	f	\N	2026-08-26 23:09:51.035493+05
1015	31	order_status_changed	Заказ DH-000064: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	64	f	\N	2026-08-26 23:09:51.035493+05
1016	37	order_status_changed	Заказ DH-000064: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	64	f	\N	2026-08-26 23:09:51.035493+05
1017	39	order_status_changed	Заказ DH-000064: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	64	f	\N	2026-08-26 23:09:51.035493+05
1018	43	order_status_changed	Заказ DH-000064: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	64	f	\N	2026-08-26 23:09:51.035493+05
1019	29	order_status_changed	Заказ DH-000064: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	64	f	\N	2026-08-26 23:09:51.037532+05
1020	31	order_status_changed	Заказ DH-000064: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	64	f	\N	2026-08-26 23:09:51.037532+05
1021	37	order_status_changed	Заказ DH-000064: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	64	f	\N	2026-08-26 23:09:51.037532+05
1022	39	order_status_changed	Заказ DH-000064: Установка идёт	Отабек Нурматов перевёл заказ в статус «Установка идёт».	64	f	\N	2026-08-26 23:09:51.037532+05
1023	29	order_status_changed	Заказ DH-000064: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	64	f	\N	2026-08-26 23:09:51.039312+05
1024	31	order_status_changed	Заказ DH-000064: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	64	f	\N	2026-08-26 23:09:51.039312+05
1025	37	order_status_changed	Заказ DH-000064: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	64	f	\N	2026-08-26 23:09:51.039312+05
1026	39	order_status_changed	Заказ DH-000064: Установка завершена	Отабек Нурматов перевёл заказ в статус «Установка завершена».	64	f	\N	2026-08-26 23:09:51.039312+05
1027	29	order_completed	Заказ DH-000064: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	64	f	\N	2026-08-26 23:09:51.041315+05
1028	31	order_completed	Заказ DH-000064: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	64	f	\N	2026-08-26 23:09:51.041315+05
1029	37	order_completed	Заказ DH-000064: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	64	f	\N	2026-08-26 23:09:51.041315+05
1030	39	order_completed	Заказ DH-000064: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	64	f	\N	2026-08-26 23:09:51.041315+05
1031	43	order_completed	Заказ DH-000064: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	64	f	\N	2026-08-26 23:09:51.041315+05
1032	31	order_assigned	Новый заказ DH-000065	Вам назначен заказ клиента «Собирова Гульнара» как «Мастер-замерщик»	65	f	\N	2026-08-26 23:09:51.048439+05
1033	28	order_status_changed	Заказ DH-000065: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	65	f	\N	2026-08-26 23:09:51.050474+05
1034	31	order_status_changed	Заказ DH-000065: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	65	f	\N	2026-08-26 23:09:51.050474+05
1035	28	order_status_changed	Заказ DH-000065: Замер выполнен	Бобур Каримов перевёл заказ в статус «Замер выполнен».	65	f	\N	2026-08-26 23:09:51.052426+05
1036	28	order_status_changed	Заказ DH-000065: Ждёт назначения швеи	Бобур Каримов перевёл заказ в статус «Ждёт назначения швеи».	65	f	\N	2026-08-26 23:09:51.054421+05
1037	36	order_assigned	Новый заказ DH-000065	Вам назначен заказ клиента «Собирова Гульнара» как «Швея»	65	f	\N	2026-08-26 23:09:51.05634+05
1038	28	order_status_changed	Заказ DH-000065: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	65	f	\N	2026-08-26 23:09:51.058613+05
1039	31	order_status_changed	Заказ DH-000065: В пошиве	Феруза Хакимова перевёл заказ в статус «В пошиве».	65	f	\N	2026-08-26 23:09:51.058613+05
1040	28	order_status_changed	Заказ DH-000065: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	65	f	\N	2026-08-26 23:09:51.060299+05
1041	31	order_status_changed	Заказ DH-000065: Пошив завершён	Феруза Хакимова перевёл заказ в статус «Пошив завершён».	65	f	\N	2026-08-26 23:09:51.060299+05
1042	28	order_status_changed	Заказ DH-000065: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	65	f	\N	2026-08-26 23:09:51.062314+05
1043	31	order_status_changed	Заказ DH-000065: На контроле качества	Феруза Хакимова перевёл заказ в статус «На контроле качества».	65	f	\N	2026-08-26 23:09:51.062314+05
1044	28	order_status_changed	Заказ DH-000065: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	65	f	\N	2026-08-26 23:09:51.064224+05
1045	31	order_status_changed	Заказ DH-000065: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	65	f	\N	2026-08-26 23:09:51.064224+05
1046	36	order_status_changed	Заказ DH-000065: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	65	f	\N	2026-08-26 23:09:51.064224+05
1047	28	order_status_changed	Заказ DH-000065: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	65	f	\N	2026-08-26 23:09:51.066325+05
1048	31	order_status_changed	Заказ DH-000065: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	65	f	\N	2026-08-26 23:09:51.066325+05
1049	36	order_status_changed	Заказ DH-000065: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	65	f	\N	2026-08-26 23:09:51.066325+05
1050	42	order_assigned	Новый заказ DH-000065	Вам назначен заказ клиента «Собирова Гульнара» как «Установщик»	65	f	\N	2026-08-26 23:09:51.068509+05
1051	28	order_status_changed	Заказ DH-000065: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	65	f	\N	2026-08-26 23:09:51.070507+05
1052	31	order_status_changed	Заказ DH-000065: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	65	f	\N	2026-08-26 23:09:51.070507+05
1053	36	order_status_changed	Заказ DH-000065: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	65	f	\N	2026-08-26 23:09:51.070507+05
1054	40	order_status_changed	Заказ DH-000065: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	65	f	\N	2026-08-26 23:09:51.070507+05
1055	42	order_status_changed	Заказ DH-000065: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	65	f	\N	2026-08-26 23:09:51.070507+05
1056	28	order_status_changed	Заказ DH-000065: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	65	f	\N	2026-08-26 23:09:51.072784+05
1057	31	order_status_changed	Заказ DH-000065: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	65	f	\N	2026-08-26 23:09:51.072784+05
1058	36	order_status_changed	Заказ DH-000065: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	65	f	\N	2026-08-26 23:09:51.072784+05
1059	40	order_status_changed	Заказ DH-000065: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	65	f	\N	2026-08-26 23:09:51.072784+05
1060	28	order_status_changed	Заказ DH-000065: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	65	f	\N	2026-08-26 23:09:51.074513+05
1061	31	order_status_changed	Заказ DH-000065: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	65	f	\N	2026-08-26 23:09:51.074513+05
1062	36	order_status_changed	Заказ DH-000065: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	65	f	\N	2026-08-26 23:09:51.074513+05
1063	40	order_status_changed	Заказ DH-000065: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	65	f	\N	2026-08-26 23:09:51.074513+05
1064	28	order_completed	Заказ DH-000065: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	65	f	\N	2026-08-26 23:09:51.076651+05
1065	31	order_completed	Заказ DH-000065: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	65	f	\N	2026-08-26 23:09:51.076651+05
1066	36	order_completed	Заказ DH-000065: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	65	f	\N	2026-08-26 23:09:51.076651+05
1067	40	order_completed	Заказ DH-000065: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	65	f	\N	2026-08-26 23:09:51.076651+05
1068	42	order_completed	Заказ DH-000065: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	65	f	\N	2026-08-26 23:09:51.076651+05
1069	32	order_assigned	Новый заказ DH-000066	Вам назначен заказ клиента «Каримова Дилором» как «Мастер-замерщик»	66	f	\N	2026-08-26 23:09:51.083056+05
1070	29	order_status_changed	Заказ DH-000066: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	66	f	\N	2026-08-26 23:09:51.084856+05
1071	32	order_status_changed	Заказ DH-000066: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	66	f	\N	2026-08-26 23:09:51.084856+05
1072	29	order_status_changed	Заказ DH-000066: Замер выполнен	Шухрат Ибрагимов перевёл заказ в статус «Замер выполнен».	66	f	\N	2026-08-26 23:09:51.087037+05
1073	29	order_status_changed	Заказ DH-000066: Ждёт назначения швеи	Шухрат Ибрагимов перевёл заказ в статус «Ждёт назначения швеи».	66	f	\N	2026-08-26 23:09:51.088737+05
1074	35	order_assigned	Новый заказ DH-000066	Вам назначен заказ клиента «Каримова Дилором» как «Швея»	66	f	\N	2026-08-26 23:09:51.090741+05
1075	29	order_status_changed	Заказ DH-000066: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	66	f	\N	2026-08-26 23:09:51.092499+05
1076	32	order_status_changed	Заказ DH-000066: В пошиве	Нигора Азизова перевёл заказ в статус «В пошиве».	66	f	\N	2026-08-26 23:09:51.092499+05
1077	29	order_status_changed	Заказ DH-000066: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	66	f	\N	2026-08-26 23:09:51.094624+05
1078	32	order_status_changed	Заказ DH-000066: Пошив завершён	Нигора Азизова перевёл заказ в статус «Пошив завершён».	66	f	\N	2026-08-26 23:09:51.094624+05
1079	29	order_status_changed	Заказ DH-000066: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	66	f	\N	2026-08-26 23:09:51.096383+05
1080	32	order_status_changed	Заказ DH-000066: На контроле качества	Нигора Азизова перевёл заказ в статус «На контроле качества».	66	f	\N	2026-08-26 23:09:51.096383+05
1081	29	order_status_changed	Заказ DH-000066: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	66	f	\N	2026-08-26 23:09:51.098438+05
1082	32	order_status_changed	Заказ DH-000066: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	66	f	\N	2026-08-26 23:09:51.098438+05
1083	35	order_status_changed	Заказ DH-000066: Контроль пройден	Камола Рустамова перевёл заказ в статус «Контроль пройден».	66	f	\N	2026-08-26 23:09:51.098438+05
1084	29	order_status_changed	Заказ DH-000066: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	66	f	\N	2026-08-26 23:09:51.100296+05
1085	32	order_status_changed	Заказ DH-000066: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	66	f	\N	2026-08-26 23:09:51.100296+05
1086	35	order_status_changed	Заказ DH-000066: Ждёт назначения установщика	Камола Рустамова перевёл заказ в статус «Ждёт назначения установщика».	66	f	\N	2026-08-26 23:09:51.100296+05
1087	41	order_assigned	Новый заказ DH-000066	Вам назначен заказ клиента «Каримова Дилором» как «Установщик»	66	f	\N	2026-08-26 23:09:51.102281+05
1088	29	order_status_changed	Заказ DH-000066: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	66	f	\N	2026-08-26 23:09:51.104809+05
1089	32	order_status_changed	Заказ DH-000066: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	66	f	\N	2026-08-26 23:09:51.104809+05
1090	35	order_status_changed	Заказ DH-000066: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	66	f	\N	2026-08-26 23:09:51.104809+05
1091	40	order_status_changed	Заказ DH-000066: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	66	f	\N	2026-08-26 23:09:51.104809+05
1092	41	order_status_changed	Заказ DH-000066: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	66	f	\N	2026-08-26 23:09:51.104809+05
1093	29	order_status_changed	Заказ DH-000066: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	66	f	\N	2026-08-26 23:09:51.106951+05
1094	32	order_status_changed	Заказ DH-000066: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	66	f	\N	2026-08-26 23:09:51.106951+05
1095	35	order_status_changed	Заказ DH-000066: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	66	f	\N	2026-08-26 23:09:51.106951+05
1096	40	order_status_changed	Заказ DH-000066: Установка идёт	Рустам Каримов перевёл заказ в статус «Установка идёт».	66	f	\N	2026-08-26 23:09:51.106951+05
1097	29	order_status_changed	Заказ DH-000066: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	66	f	\N	2026-08-26 23:09:51.109093+05
1098	32	order_status_changed	Заказ DH-000066: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	66	f	\N	2026-08-26 23:09:51.109093+05
1099	35	order_status_changed	Заказ DH-000066: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	66	f	\N	2026-08-26 23:09:51.109093+05
1100	40	order_status_changed	Заказ DH-000066: Установка завершена	Рустам Каримов перевёл заказ в статус «Установка завершена».	66	f	\N	2026-08-26 23:09:51.109093+05
1101	29	order_completed	Заказ DH-000066: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	66	f	\N	2026-08-26 23:09:51.110894+05
1102	32	order_completed	Заказ DH-000066: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	66	f	\N	2026-08-26 23:09:51.110894+05
1103	35	order_completed	Заказ DH-000066: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	66	f	\N	2026-08-26 23:09:51.110894+05
1104	40	order_completed	Заказ DH-000066: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	66	f	\N	2026-08-26 23:09:51.110894+05
1105	41	order_completed	Заказ DH-000066: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	66	f	\N	2026-08-26 23:09:51.110894+05
1106	30	order_assigned	Новый заказ DH-000067	Вам назначен заказ клиента «Назаров Улугбек» как «Мастер-замерщик»	67	f	\N	2026-08-26 23:09:51.117093+05
1107	29	order_status_changed	Заказ DH-000067: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	67	f	\N	2026-08-26 23:09:51.119142+05
1108	30	order_status_changed	Заказ DH-000067: Назначен замер	Дилшод Мирзаев перевёл заказ в статус «Назначен замер».	67	f	\N	2026-08-26 23:09:51.119142+05
1109	29	order_status_changed	Заказ DH-000067: Замер выполнен	Азиз Абдуллаев перевёл заказ в статус «Замер выполнен».	67	f	\N	2026-08-26 23:09:51.1208+05
1110	29	order_status_changed	Заказ DH-000067: Ждёт назначения швеи	Азиз Абдуллаев перевёл заказ в статус «Ждёт назначения швеи».	67	f	\N	2026-08-26 23:09:51.122913+05
1111	33	order_assigned	Новый заказ DH-000067	Вам назначен заказ клиента «Назаров Улугбек» как «Швея»	67	f	\N	2026-08-26 23:09:51.127343+05
1112	29	order_status_changed	Заказ DH-000067: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	67	f	\N	2026-08-26 23:09:51.129572+05
1113	30	order_status_changed	Заказ DH-000067: В пошиве	Зухра Нормуродова перевёл заказ в статус «В пошиве».	67	f	\N	2026-08-26 23:09:51.129572+05
1114	29	order_status_changed	Заказ DH-000067: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	67	f	\N	2026-08-26 23:09:51.131388+05
1115	30	order_status_changed	Заказ DH-000067: Пошив завершён	Зухра Нормуродова перевёл заказ в статус «Пошив завершён».	67	f	\N	2026-08-26 23:09:51.131388+05
1116	29	order_status_changed	Заказ DH-000067: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	67	f	\N	2026-08-26 23:09:51.133407+05
1117	30	order_status_changed	Заказ DH-000067: На контроле качества	Зухра Нормуродова перевёл заказ в статус «На контроле качества».	67	f	\N	2026-08-26 23:09:51.133407+05
1118	29	order_status_changed	Заказ DH-000067: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	67	f	\N	2026-08-26 23:09:51.13515+05
1119	30	order_status_changed	Заказ DH-000067: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	67	f	\N	2026-08-26 23:09:51.13515+05
1120	33	order_status_changed	Заказ DH-000067: Контроль пройден	Нилуфар Ахмедова перевёл заказ в статус «Контроль пройден».	67	f	\N	2026-08-26 23:09:51.13515+05
1121	29	order_status_changed	Заказ DH-000067: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	67	f	\N	2026-08-26 23:09:51.137379+05
1122	30	order_status_changed	Заказ DH-000067: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	67	f	\N	2026-08-26 23:09:51.137379+05
1123	33	order_status_changed	Заказ DH-000067: Ждёт назначения установщика	Нилуфар Ахмедова перевёл заказ в статус «Ждёт назначения установщика».	67	f	\N	2026-08-26 23:09:51.137379+05
1124	42	order_assigned	Новый заказ DH-000067	Вам назначен заказ клиента «Назаров Улугбек» как «Установщик»	67	f	\N	2026-08-26 23:09:51.139466+05
1125	29	order_status_changed	Заказ DH-000067: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	67	f	\N	2026-08-26 23:09:51.141522+05
1126	30	order_status_changed	Заказ DH-000067: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	67	f	\N	2026-08-26 23:09:51.141522+05
1127	33	order_status_changed	Заказ DH-000067: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	67	f	\N	2026-08-26 23:09:51.141522+05
1128	39	order_status_changed	Заказ DH-000067: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	67	f	\N	2026-08-26 23:09:51.141522+05
1129	42	order_status_changed	Заказ DH-000067: Назначен установщик	Дилшод Мирзаев перевёл заказ в статус «Назначен установщик».	67	f	\N	2026-08-26 23:09:51.141522+05
1130	29	order_status_changed	Заказ DH-000067: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	67	f	\N	2026-08-26 23:09:51.143704+05
1131	30	order_status_changed	Заказ DH-000067: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	67	f	\N	2026-08-26 23:09:51.143704+05
1132	33	order_status_changed	Заказ DH-000067: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	67	f	\N	2026-08-26 23:09:51.143704+05
1133	39	order_status_changed	Заказ DH-000067: Установка идёт	Жасур Тошматов перевёл заказ в статус «Установка идёт».	67	f	\N	2026-08-26 23:09:51.143704+05
1134	29	order_status_changed	Заказ DH-000067: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	67	f	\N	2026-08-26 23:09:51.145616+05
1135	30	order_status_changed	Заказ DH-000067: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	67	f	\N	2026-08-26 23:09:51.145616+05
1136	33	order_status_changed	Заказ DH-000067: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	67	f	\N	2026-08-26 23:09:51.145616+05
1137	39	order_status_changed	Заказ DH-000067: Установка завершена	Жасур Тошматов перевёл заказ в статус «Установка завершена».	67	f	\N	2026-08-26 23:09:51.145616+05
1138	29	order_completed	Заказ DH-000067: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	67	f	\N	2026-08-26 23:09:51.147837+05
1139	30	order_completed	Заказ DH-000067: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	67	f	\N	2026-08-26 23:09:51.147837+05
1140	33	order_completed	Заказ DH-000067: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	67	f	\N	2026-08-26 23:09:51.147837+05
1141	39	order_completed	Заказ DH-000067: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	67	f	\N	2026-08-26 23:09:51.147837+05
1142	42	order_completed	Заказ DH-000067: Выполнен	Дилшод Мирзаев перевёл заказ в статус «Выполнен».	67	f	\N	2026-08-26 23:09:51.147837+05
1143	28	order_cancelled	Заказ DH-000068: Отменён	Дилшод Мирзаев перевёл заказ в статус «Отменён». Причина: Клиент выбрал другого подрядчика	68	f	\N	2026-08-26 23:09:51.155129+05
1144	26	order_cancelled	Заказ DH-000069: Отменён	Дилшод Мирзаев перевёл заказ в статус «Отменён». Причина: Клиент отказался от заказа	69	f	\N	2026-08-26 23:09:51.163299+05
1145	26	order_cancelled	Заказ DH-000070: Отменён	Дилшод Мирзаев перевёл заказ в статус «Отменён». Причина: Клиент выбрал другого подрядчика	70	f	\N	2026-08-26 23:09:51.169858+05
\.


--
-- Data for Name: order_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_comments (id, order_id, user_id, body, is_voice, voice_storage_key, voice_duration_seconds, created_at) FROM stdin;
1	5	26	Ткань привезли, можно раскраивать	f	\N	\N	2026-08-26 23:09:49.691882+05
2	8	26	Ткань привезли, можно раскраивать	f	\N	\N	2026-08-26 23:09:49.716195+05
3	10	44	Ткань привезли, можно раскраивать	f	\N	\N	2026-08-26 23:09:49.733821+05
4	11	26	Ткань привезли, можно раскраивать	f	\N	\N	2026-08-26 23:09:49.743807+05
5	12	44	Клиент просил перезвонить после 18:00	f	\N	\N	2026-08-26 23:09:49.759268+05
6	17	44	Клиент просил перезвонить после 18:00	f	\N	\N	2026-08-26 23:09:49.822457+05
7	18	44	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:49.837029+05
8	21	44	Клиент передвинул установку на следующую неделю	f	\N	\N	2026-08-26 23:09:49.886737+05
9	34	28	Клиент просил перезвонить после 18:00	f	\N	\N	2026-08-26 23:09:50.14704+05
10	35	29	Клиент передвинул установку на следующую неделю	f	\N	\N	2026-08-26 23:09:50.172051+05
11	36	28	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:50.204958+05
12	37	26	Клиент передвинул установку на следующую неделю	f	\N	\N	2026-08-26 23:09:50.228295+05
13	45	28	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:50.412435+05
14	46	27	Ткань привезли, можно раскраивать	f	\N	\N	2026-08-26 23:09:50.439936+05
15	51	29	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:50.581664+05
16	53	26	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:50.647253+05
17	54	44	Клиент просил перезвонить после 18:00	f	\N	\N	2026-08-26 23:09:50.684612+05
18	58	26	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:50.831918+05
19	61	44	Ткань привезли, можно раскраивать	f	\N	\N	2026-08-26 23:09:50.937896+05
20	63	44	Клиент передвинул установку на следующую неделю	f	\N	\N	2026-08-26 23:09:51.008444+05
21	67	44	Клиент просил перезвонить после 18:00	f	\N	\N	2026-08-26 23:09:51.150249+05
22	70	44	Согласовали замену цвета на бежевый	f	\N	\N	2026-08-26 23:09:51.172224+05
\.


--
-- Data for Name: order_installation_team; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_installation_team (order_id, user_id, added_by, added_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, kind, "position", model, materials, material_options, color, characteristics, width_cm, height_cm, area_m2, cornice, cornice_rotation, tulle, sachak, accessory, quantity, comment, created_at, updated_at) FROM stdin;
5	5	window	0	Плиссе	{Габардин,Органза}	{Однотонный}	Серый	\N	349.0	174.0	6.0726	Багетный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:49.682385+05	2026-08-26 23:09:49.682385+05
6	6	window	0	Японские	{Шёлк}	{Шёлк}	Зелёный	\N	235.0	287.0	6.7445	Струнный	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.695245+05	2026-08-26 23:09:49.695245+05
7	6	door	1	Шторы-кафе	{Тюль}	{Бархатные}	Серый	\N	267.0	162.0	4.3254	Магнитный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.695994+05	2026-08-26 23:09:49.695994+05
8	6	window	2	Австрийские	{Габардин,Блэкаут}	{"С рисунком"}	Коричневый	\N	303.0	262.0	7.9386	Электро	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:49.697014+05	2026-08-26 23:09:49.697014+05
9	7	window	0	Двойные	{Атлас}	{Перламутровый,Бархатные}	Чёрный	\N	385.0	202.0	7.7770	Потолочный пластик	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:49.703911+05	2026-08-26 23:09:49.703911+05
10	7	window	1	Французские	{Велюр,Атлас}	{"С принтом"}	Бежевый	\N	126.0	178.0	2.2428	Магнитный	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:49.704763+05	2026-08-26 23:09:49.704763+05
11	8	window	0	Римские	{Габардин,Атлас}	{Матовый}	Коричневый	\N	339.0	249.0	8.4411	Потолочный алюминий	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.711065+05	2026-08-26 23:09:49.711065+05
12	9	window	0	Шторы-кафе	{Габардин}	{Шёлк}	Бежевый	\N	294.0	165.0	4.8510	Багетный	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:49.717812+05	2026-08-26 23:09:49.717812+05
13	10	window	0	Ламбрекен	{Шёлк,Жаккард}	{Шёлк}	Синий	\N	309.0	150.0	4.6350	Струнный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:49.724389+05	2026-08-26 23:09:49.724389+05
14	10	door	1	Жингалак	{Атлас}	{Шёлк}	Белый	\N	394.0	186.0	7.3284	Струнный	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:49.725162+05	2026-08-26 23:09:49.725162+05
15	10	window	2	Жингалак	{Велюр,Органза}	{Матовый}	Серый	\N	153.0	167.0	2.5551	Багетный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:49.725728+05	2026-08-26 23:09:49.725728+05
16	11	window	0	Жингалак	{Блэкаут}	{Матовый}	Серый	\N	354.0	264.0	9.3456	Потолочный алюминий	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.735255+05	2026-08-26 23:09:49.735255+05
17	11	window	1	Рулонные	{Лён}	{"С рисунком",Матовый}	Бежевый	\N	370.0	294.0	10.8780	Электро	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.736004+05	2026-08-26 23:09:49.736004+05
18	12	window	0	Нитяные	{Органза}	{Текстурный,"С рисунком"}	Золотой	\N	257.0	215.0	5.5255	Багетный	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.745698+05	2026-08-26 23:09:49.745698+05
19	12	door	1	Японские	{Хлопок,Габардин}	{Шёлк,Однотонный}	Красный	\N	339.0	275.0	9.3225	Багетный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.746278+05	2026-08-26 23:09:49.746278+05
20	12	window	2	Японские	{Хлопок}	{"С принтом"}	Золотой	\N	195.0	142.0	2.7690	Электро	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:49.746884+05	2026-08-26 23:09:49.746884+05
21	13	window	0	Французские	{Тюль}	{Однотонный,Глянцевый}	Синий	\N	262.0	187.0	4.8994	Струнный	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:49.760681+05	2026-08-26 23:09:49.760681+05
22	13	door	1	Ламбрекен	{Лён,Шёлк}	{"С принтом"}	Коричневый	\N	214.0	175.0	3.7450	Двойной	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.761361+05	2026-08-26 23:09:49.761361+05
23	14	window	0	Шторы-кафе	{Габардин}	{Однотонный}	Синий	\N	123.0	143.0	1.7589	Струнный	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:49.773285+05	2026-08-26 23:09:49.773285+05
24	14	door	1	Нитяные	{Хлопок}	{Шёлк,Перламутровый}	Серый	\N	325.0	182.0	5.9150	Электро	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:49.773784+05	2026-08-26 23:09:49.773784+05
25	15	window	0	Ламбрекен	{Тюль,Блэкаут}	{Глянцевый,"С принтом"}	Синий	\N	348.0	177.0	6.1596	Багетный	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:49.783718+05	2026-08-26 23:09:49.783718+05
26	15	window	1	Австрийские	{Шёлк}	{Перламутровый,Шёлк}	Коричневый	\N	282.0	273.0	7.6986	Электро	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:49.784189+05	2026-08-26 23:09:49.784189+05
27	15	door	2	Жингалак	{Велюр,Шёлк}	{Глянцевый}	Синий	\N	396.0	150.0	5.9400	Профильный алюминий	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.784684+05	2026-08-26 23:09:49.784684+05
28	16	window	0	Бамбуковые	{Органза,Атлас}	{"С рисунком"}	Зелёный	\N	98.0	243.0	2.3814	Потолочный пластик	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.794881+05	2026-08-26 23:09:49.794881+05
29	16	door	1	Блэкаут	{Атлас}	{"С принтом",Шёлк}	Красный	\N	142.0	154.0	2.1868	Багетный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.795506+05	2026-08-26 23:09:49.795506+05
30	16	window	2	Двойные	{Блэкаут,Атлас}	{"С рисунком","С принтом"}	Зелёный	\N	399.0	225.0	8.9775	Багетный	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:49.796128+05	2026-08-26 23:09:49.796128+05
31	17	window	0	Шторы-кафе	{Габардин}	{Бархатные}	Красный	\N	324.0	230.0	7.4520	Круглый дерево	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:49.81034+05	2026-08-26 23:09:49.81034+05
32	17	window	1	Двойные	{Жаккард}	{Однотонный,Матовый}	Серебряный	\N	292.0	201.0	5.8692	Струнный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.811068+05	2026-08-26 23:09:49.811068+05
33	18	window	0	Прямые	{Шёлк}	{"С рисунком",Перламутровый}	Зелёный	\N	397.0	162.0	6.4314	Круглый металл	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.823814+05	2026-08-26 23:09:49.823814+05
34	18	door	1	Французские	{Лён}	{"С принтом"}	Красный	\N	313.0	175.0	5.4775	Двойной	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.824828+05	2026-08-26 23:09:49.824828+05
35	18	door	2	Плиссе	{Блэкаут}	{Текстурный}	Золотой	\N	103.0	164.0	1.6892	Потолочный пластик	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.825405+05	2026-08-26 23:09:49.825405+05
36	19	window	0	Римские	{Жаккард,Шёлк}	{"С принтом",Матовый}	Серебряный	\N	292.0	215.0	6.2780	Электро	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.838306+05	2026-08-26 23:09:49.838306+05
37	20	window	0	Японские	{Велюр,Тюль}	{"С принтом",Перламутровый}	Чёрный	\N	356.0	150.0	5.3400	Багетный	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:49.856163+05	2026-08-26 23:09:49.856163+05
38	21	window	0	Жингалак	{Лён}	{Бархатные,Шёлк}	Чёрный	\N	259.0	218.0	5.6462	Профильный алюминий	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:49.872285+05	2026-08-26 23:09:49.872285+05
39	21	door	1	Австрийские	{Блэкаут}	{Однотонный}	Зелёный	\N	392.0	159.0	6.2328	Струнный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:49.872933+05	2026-08-26 23:09:49.872933+05
40	21	door	2	Австрийские	{Шёлк}	{Глянцевый,Матовый}	Бежевый	\N	392.0	271.0	10.6232	Электро	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:49.87351+05	2026-08-26 23:09:49.87351+05
41	22	window	0	Римские	{Шёлк,Лён}	{Матовый}	Зелёный	\N	160.0	285.0	4.5600	Магнитный	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:49.887864+05	2026-08-26 23:09:49.887864+05
42	22	window	1	Бамбуковые	{Шёлк}	{Глянцевый}	Коричневый	\N	290.0	293.0	8.4970	Круглый металл	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:49.888285+05	2026-08-26 23:09:49.888285+05
43	22	window	2	Блэкаут	{Атлас}	{Однотонный}	Красный	\N	114.0	148.0	1.6872	Багетный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:49.888764+05	2026-08-26 23:09:49.888764+05
44	23	window	0	Шторы-кафе	{Габардин,Хлопок}	{Перламутровый}	Бежевый	\N	391.0	221.0	8.6411	Двойной	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.903238+05	2026-08-26 23:09:49.903238+05
45	23	window	1	Римские	{Атлас}	{"С принтом",Глянцевый}	Синий	\N	235.0	248.0	5.8280	Электро	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:49.903775+05	2026-08-26 23:09:49.903775+05
46	24	window	0	Жингалак	{Лён,Тюль}	{Перламутровый}	Коричневый	\N	294.0	236.0	6.9384	Круглый дерево	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:49.919845+05	2026-08-26 23:09:49.919845+05
47	24	door	1	Австрийские	{Жаккард}	{Однотонный}	Белый	\N	128.0	181.0	2.3168	Струнный	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:49.920264+05	2026-08-26 23:09:49.920264+05
48	25	window	0	Французские	{Лён}	{Бархатные}	Серый	\N	256.0	221.0	5.6576	Багетный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.935274+05	2026-08-26 23:09:49.935274+05
49	26	window	0	Ламбрекен	{Жаккард,Лён}	{"С принтом",Перламутровый}	Бежевый	\N	151.0	258.0	3.8958	Потолочный алюминий	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:49.955233+05	2026-08-26 23:09:49.955233+05
50	26	door	1	Римские	{Лён}	{Однотонный}	Синий	\N	133.0	255.0	3.3915	Потолочный алюминий	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:49.955668+05	2026-08-26 23:09:49.955668+05
51	27	window	0	Римские	{Тюль,Велюр}	{"С принтом",Текстурный}	Серый	\N	333.0	253.0	8.4249	Багетный	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:49.97831+05	2026-08-26 23:09:49.97831+05
52	27	door	1	Французские	{Тюль}	{Перламутровый}	Зелёный	\N	394.0	277.0	10.9138	Потолочный пластик	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:49.979069+05	2026-08-26 23:09:49.979069+05
53	28	window	0	Японские	{Габардин}	{"С принтом"}	Серый	\N	137.0	175.0	2.3975	Магнитный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:49.999135+05	2026-08-26 23:09:49.999135+05
54	28	door	1	Блэкаут	{Органза,Велюр}	{Перламутровый,Матовый}	Коричневый	\N	269.0	274.0	7.3706	Потолочный алюминий	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:49.999714+05	2026-08-26 23:09:49.999714+05
55	28	window	2	Нитяные	{Атлас,Органза}	{Глянцевый,Перламутровый}	Красный	\N	146.0	218.0	3.1828	Электро	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.000398+05	2026-08-26 23:09:50.000398+05
56	29	window	0	Блэкаут	{Блэкаут}	{Однотонный}	Золотой	\N	229.0	246.0	5.6334	Багетный	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:50.020325+05	2026-08-26 23:09:50.020325+05
57	29	window	1	Жингалак	{Органза,Лён}	{Бархатные}	Синий	\N	162.0	229.0	3.7098	Потолочный алюминий	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:50.020788+05	2026-08-26 23:09:50.020788+05
58	30	window	0	Ламбрекен	{Блэкаут}	{Матовый,Перламутровый}	Белый	\N	190.0	244.0	4.6360	Багетный	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:50.041192+05	2026-08-26 23:09:50.041192+05
59	30	door	1	Нитяные	{Блэкаут,Лён}	{Глянцевый,Однотонный}	Белый	\N	278.0	278.0	7.7284	Электро	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:50.041705+05	2026-08-26 23:09:50.041705+05
60	30	door	2	Жингалак	{Шёлк,Блэкаут}	{Бархатные}	Серый	\N	151.0	169.0	2.5519	Струнный	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.042114+05	2026-08-26 23:09:50.042114+05
61	31	window	0	Прямые	{Велюр}	{"С принтом"}	Зелёный	\N	218.0	252.0	5.4936	Струнный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.060754+05	2026-08-26 23:09:50.060754+05
62	32	window	0	Плиссе	{Атлас}	{Текстурный,Однотонный}	Белый	\N	351.0	250.0	8.7750	Багетный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.080737+05	2026-08-26 23:09:50.080737+05
63	32	door	1	Нитяные	{Атлас}	{Текстурный,Однотонный}	Золотой	\N	316.0	255.0	8.0580	Круглый дерево	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.081303+05	2026-08-26 23:09:50.081303+05
64	33	window	0	Рулонные	{Тюль}	{"С принтом",Бархатные}	Белый	\N	131.0	220.0	2.8820	Потолочный пластик	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.105507+05	2026-08-26 23:09:50.105507+05
65	34	window	0	Римские	{Лён}	{Глянцевый,"С принтом"}	Красный	\N	375.0	231.0	8.6625	Магнитный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.12677+05	2026-08-26 23:09:50.12677+05
66	35	window	0	Японские	{Блэкаут}	{Шёлк,Матовый}	Красный	\N	277.0	153.0	4.2381	Багетный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.148359+05	2026-08-26 23:09:50.148359+05
67	35	door	1	Японские	{Шёлк,Органза}	{Глянцевый}	Коричневый	\N	158.0	149.0	2.3542	Магнитный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.148896+05	2026-08-26 23:09:50.148896+05
68	35	window	2	Двойные	{Атлас,Тюль}	{Бархатные}	Зелёный	\N	284.0	263.0	7.4692	Электро	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.149338+05	2026-08-26 23:09:50.149338+05
69	36	window	0	Жингалак	{Атлас}	{Шёлк,Текстурный}	Зелёный	\N	101.0	198.0	1.9998	Двойной	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:50.173298+05	2026-08-26 23:09:50.173298+05
70	37	window	0	Прямые	{Органза,Шёлк}	{Шёлк}	Бежевый	\N	202.0	163.0	3.2926	Круглый металл	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.20614+05	2026-08-26 23:09:50.20614+05
71	38	window	0	Нитяные	{Велюр,Лён}	{Бархатные,Перламутровый}	Серый	\N	186.0	285.0	5.3010	Круглый металл	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.229637+05	2026-08-26 23:09:50.229637+05
72	38	window	1	Нитяные	{Органза}	{Глянцевый}	Чёрный	\N	350.0	291.0	10.1850	Багетный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.23008+05	2026-08-26 23:09:50.23008+05
73	39	window	0	Шторы-кафе	{Хлопок,Лён}	{"С принтом"}	Бежевый	\N	395.0	224.0	8.8480	Потолочный алюминий	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:50.249387+05	2026-08-26 23:09:50.249387+05
74	40	window	0	Французские	{Органза}	{Матовый}	Зелёный	\N	132.0	295.0	3.8940	Магнитный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.268817+05	2026-08-26 23:09:50.268817+05
75	40	door	1	Нитяные	{Лён,Велюр}	{"С принтом",Матовый}	Серый	\N	228.0	184.0	4.1952	Круглый дерево	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:50.269299+05	2026-08-26 23:09:50.269299+05
76	41	window	0	Двойные	{Блэкаут,Хлопок}	{Перламутровый,"С рисунком"}	Золотой	\N	101.0	249.0	2.5149	Струнный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.293261+05	2026-08-26 23:09:50.293261+05
77	41	window	1	Плиссе	{Блэкаут,Атлас}	{Бархатные}	Синий	\N	264.0	256.0	6.7584	Струнный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.293757+05	2026-08-26 23:09:50.293757+05
78	42	window	0	Прямые	{Органза,Тюль}	{Однотонный}	Красный	\N	188.0	234.0	4.3992	Струнный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.317195+05	2026-08-26 23:09:50.317195+05
79	42	door	1	Шторы-кафе	{Атлас}	{"С рисунком"}	Серебряный	\N	116.0	211.0	2.4476	Двойной	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.317656+05	2026-08-26 23:09:50.317656+05
80	43	window	0	Французские	{Хлопок,Велюр}	{"С рисунком"}	Коричневый	\N	355.0	163.0	5.7865	Потолочный алюминий	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.343341+05	2026-08-26 23:09:50.343341+05
81	43	window	1	Рулонные	{Шёлк}	{Перламутровый,Бархатные}	Бежевый	\N	130.0	264.0	3.4320	Багетный	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:50.343915+05	2026-08-26 23:09:50.343915+05
82	43	door	2	Двойные	{Хлопок,Блэкаут}	{"С принтом","С рисунком"}	Коричневый	\N	367.0	240.0	8.8080	Багетный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.344524+05	2026-08-26 23:09:50.344524+05
83	44	window	0	Рулонные	{Жаккард}	{Матовый,Текстурный}	Зелёный	\N	216.0	290.0	6.2640	Потолочный алюминий	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:50.366111+05	2026-08-26 23:09:50.366111+05
84	44	door	1	Плиссе	{Габардин}	{Текстурный}	Синий	\N	103.0	261.0	2.6883	Струнный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.36656+05	2026-08-26 23:09:50.36656+05
85	44	door	2	Блэкаут	{Лён}	{Глянцевый,Шёлк}	Серебряный	\N	384.0	272.0	10.4448	Круглый металл	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.366944+05	2026-08-26 23:09:50.366944+05
86	45	window	0	Французские	{Органза,Хлопок}	{Однотонный}	Золотой	\N	135.0	191.0	2.5785	Потолочный алюминий	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:50.38792+05	2026-08-26 23:09:50.38792+05
87	46	window	0	Японские	{Лён}	{Матовый,"С принтом"}	Коричневый	\N	338.0	213.0	7.1994	Струнный	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.413604+05	2026-08-26 23:09:50.413604+05
88	46	window	1	Нитяные	{Атлас,Тюль}	{Глянцевый}	Бежевый	\N	263.0	290.0	7.6270	Электро	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.414091+05	2026-08-26 23:09:50.414091+05
89	47	window	0	Французские	{Шёлк,Атлас}	{"С рисунком"}	Коричневый	\N	224.0	183.0	4.0992	Круглый дерево	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.441945+05	2026-08-26 23:09:50.441945+05
90	47	door	1	Римские	{Жаккард,Блэкаут}	{Шёлк,Перламутровый}	Зелёный	\N	145.0	157.0	2.2765	Круглый металл	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.442386+05	2026-08-26 23:09:50.442386+05
91	47	window	2	Ламбрекен	{Шёлк}	{"С принтом","С рисунком"}	Коричневый	\N	328.0	289.0	9.4792	Потолочный алюминий	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.442899+05	2026-08-26 23:09:50.442899+05
92	48	window	0	Шторы-кафе	{Лён}	{Глянцевый,Шёлк}	Чёрный	\N	227.0	210.0	4.7670	Потолочный пластик	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.468684+05	2026-08-26 23:09:50.468684+05
93	48	window	1	Нитяные	{Органза}	{Глянцевый,Однотонный}	Золотой	\N	346.0	237.0	8.2002	Электро	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.469152+05	2026-08-26 23:09:50.469152+05
94	49	window	0	Японские	{Габардин}	{Матовый,Перламутровый}	Золотой	\N	315.0	239.0	7.5285	Магнитный	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:50.493042+05	2026-08-26 23:09:50.493042+05
95	49	window	1	Блэкаут	{Тюль}	{"С рисунком",Однотонный}	Серебряный	\N	338.0	255.0	8.6190	Круглый металл	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.493783+05	2026-08-26 23:09:50.493783+05
96	49	window	2	Шторы-кафе	{Хлопок,Атлас}	{Перламутровый}	Белый	\N	372.0	151.0	5.6172	Потолочный пластик	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.494292+05	2026-08-26 23:09:50.494292+05
97	50	window	0	Японские	{Шёлк,Лён}	{"С принтом"}	Серый	\N	171.0	282.0	4.8222	Магнитный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.523823+05	2026-08-26 23:09:50.523823+05
98	50	door	1	Рулонные	{Тюль,Атлас}	{"С рисунком"}	Золотой	\N	104.0	242.0	2.5168	Круглый дерево	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.524221+05	2026-08-26 23:09:50.524221+05
99	50	door	2	Австрийские	{Атлас}	{"С принтом"}	Золотой	\N	206.0	293.0	6.0358	Потолочный пластик	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.524592+05	2026-08-26 23:09:50.524592+05
100	51	window	0	Бамбуковые	{Блэкаут,Жаккард}	{"С рисунком"}	Бежевый	\N	193.0	184.0	3.5512	Потолочный алюминий	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.553771+05	2026-08-26 23:09:50.553771+05
101	51	window	1	Двойные	{Шёлк,Велюр}	{"С принтом",Перламутровый}	Золотой	\N	383.0	297.0	11.3751	Круглый металл	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.554316+05	2026-08-26 23:09:50.554316+05
102	51	window	2	Австрийские	{Органза,Блэкаут}	{"С принтом"}	Бежевый	\N	203.0	209.0	4.2427	Потолочный алюминий	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.554793+05	2026-08-26 23:09:50.554793+05
103	52	window	0	Прямые	{Хлопок}	{Бархатные}	Белый	\N	284.0	271.0	7.6964	Потолочный пластик	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.5828+05	2026-08-26 23:09:50.5828+05
104	52	door	1	Прямые	{Хлопок,Блэкаут}	{Перламутровый}	Зелёный	\N	102.0	205.0	2.0910	Электро	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.58325+05	2026-08-26 23:09:50.58325+05
105	52	window	2	Плиссе	{Шёлк}	{Бархатные}	Синий	\N	96.0	168.0	1.6128	Профильный алюминий	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.583622+05	2026-08-26 23:09:50.583622+05
106	53	window	0	Нитяные	{Хлопок}	{Глянцевый,"С рисунком"}	Серый	\N	386.0	273.0	10.5378	Потолочный алюминий	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.613389+05	2026-08-26 23:09:50.613389+05
107	54	window	0	Двойные	{Жаккард}	{"С рисунком"}	Синий	\N	174.0	286.0	4.9764	Потолочный пластик	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.648226+05	2026-08-26 23:09:50.648226+05
108	54	door	1	Блэкаут	{Блэкаут,Габардин}	{Текстурный,Бархатные}	Синий	\N	365.0	198.0	7.2270	Электро	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:50.648611+05	2026-08-26 23:09:50.648611+05
109	55	window	0	Двойные	{Шёлк}	{Однотонный}	Серый	\N	337.0	244.0	8.2228	Электро	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.685775+05	2026-08-26 23:09:50.685775+05
110	56	window	0	Блэкаут	{Лён}	{"С принтом"}	Бежевый	\N	292.0	299.0	8.7308	Багетный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.722469+05	2026-08-26 23:09:50.722469+05
111	57	window	0	Нитяные	{Тюль}	{Матовый}	Зелёный	\N	253.0	214.0	5.4142	Потолочный алюминий	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:50.760384+05	2026-08-26 23:09:50.760384+05
112	57	window	1	Нитяные	{Габардин}	{Глянцевый}	Бежевый	\N	310.0	215.0	6.6650	Круглый дерево	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.760883+05	2026-08-26 23:09:50.760883+05
113	58	window	0	Римские	{Тюль}	{"С принтом",Матовый}	Белый	\N	141.0	209.0	2.9469	Потолочный пластик	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:50.793924+05	2026-08-26 23:09:50.793924+05
114	58	window	1	Прямые	{Органза}	{Однотонный,Глянцевый}	Красный	\N	115.0	261.0	3.0015	Двойной	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:50.794337+05	2026-08-26 23:09:50.794337+05
115	58	window	2	Плиссе	{Жаккард}	{Шёлк,"С рисунком"}	Чёрный	\N	382.0	285.0	10.8870	Профильный алюминий	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.794704+05	2026-08-26 23:09:50.794704+05
116	59	window	0	Прямые	{Шёлк,Хлопок}	{"С принтом",Однотонный}	Серебряный	\N	369.0	143.0	5.2767	Профильный алюминий	\N	Органза	\N	\N	1	\N	2026-08-26 23:09:50.833152+05	2026-08-26 23:09:50.833152+05
117	59	door	1	Ламбрекен	{Блэкаут,Атлас}	{"С рисунком"}	Бежевый	\N	205.0	298.0	6.1090	Круглый дерево	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.833572+05	2026-08-26 23:09:50.833572+05
118	59	window	2	Французские	{Атлас,Органза}	{"С рисунком",Матовый}	Серебряный	\N	277.0	287.0	7.9499	Магнитный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.833946+05	2026-08-26 23:09:50.833946+05
119	60	window	0	Шторы-кафе	{Габардин}	{Бархатные,"С принтом"}	Серый	\N	371.0	233.0	8.6443	Струнный	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:50.867693+05	2026-08-26 23:09:50.867693+05
120	60	window	1	Шторы-кафе	{Атлас,Габардин}	{Матовый}	Золотой	\N	264.0	285.0	7.5240	Струнный	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.868389+05	2026-08-26 23:09:50.868389+05
121	61	window	0	Римские	{Шёлк}	{"С рисунком"}	Зелёный	\N	286.0	229.0	6.5494	Магнитный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.904536+05	2026-08-26 23:09:50.904536+05
122	61	window	1	Бамбуковые	{Лён,Атлас}	{Однотонный,Текстурный}	Зелёный	\N	332.0	300.0	9.9600	Двойной	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:50.904943+05	2026-08-26 23:09:50.904943+05
123	61	door	2	Плиссе	{Габардин}	{Шёлк,Матовый}	Белый	\N	328.0	162.0	5.3136	Электро	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:50.905305+05	2026-08-26 23:09:50.905305+05
124	62	window	0	Римские	{Жаккард,Габардин}	{Матовый,"С принтом"}	Коричневый	\N	314.0	241.0	7.5674	Круглый металл	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.938844+05	2026-08-26 23:09:50.938844+05
125	62	door	1	Прямые	{Блэкаут,Велюр}	{Перламутровый,Шёлк}	Синий	\N	319.0	219.0	6.9861	Магнитный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:50.939316+05	2026-08-26 23:09:50.939316+05
126	63	window	0	Прямые	{Тюль,Блэкаут}	{Однотонный}	Зелёный	\N	90.0	246.0	2.2140	Потолочный алюминий	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:50.973367+05	2026-08-26 23:09:50.973367+05
127	63	door	1	Двойные	{Органза,Габардин}	{Глянцевый}	Зелёный	\N	302.0	288.0	8.6976	Потолочный алюминий	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:50.973769+05	2026-08-26 23:09:50.973769+05
128	64	window	0	Бамбуковые	{Велюр}	{Однотонный,"С принтом"}	Синий	\N	222.0	155.0	3.4410	Струнный	\N	Сетка	\N	\N	1	\N	2026-08-26 23:09:51.009466+05	2026-08-26 23:09:51.009466+05
129	64	door	1	Жингалак	{Габардин,Шёлк}	{Глянцевый,Однотонный}	Золотой	\N	296.0	147.0	4.3512	Багетный	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:51.009857+05	2026-08-26 23:09:51.009857+05
130	64	window	2	Плиссе	{Атлас}	{"С принтом",Перламутровый}	Зелёный	\N	245.0	238.0	5.8310	Магнитный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:51.010219+05	2026-08-26 23:09:51.010219+05
131	65	window	0	Жингалак	{Органза,Велюр}	{"С принтом"}	Коричневый	\N	353.0	190.0	6.7070	Круглый дерево	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:51.045682+05	2026-08-26 23:09:51.045682+05
132	65	window	1	Блэкаут	{Велюр,Органза}	{Глянцевый}	Белый	\N	121.0	229.0	2.7709	Багетный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:51.046068+05	2026-08-26 23:09:51.046068+05
133	66	window	0	Римские	{Хлопок,Велюр}	{Глянцевый,Перламутровый}	Серебряный	\N	311.0	257.0	7.9927	Багетный	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:51.080159+05	2026-08-26 23:09:51.080159+05
134	66	door	1	Римские	{Велюр,Блэкаут}	{"С рисунком"}	Серебряный	\N	103.0	280.0	2.8840	Двойной	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:51.080564+05	2026-08-26 23:09:51.080564+05
135	67	window	0	Блэкаут	{Жаккард}	{"С рисунком",Бархатные}	Коричневый	\N	306.0	196.0	5.9976	Багетный	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:51.114092+05	2026-08-26 23:09:51.114092+05
136	67	door	1	Плиссе	{Хлопок,Габардин}	{"С рисунком"}	Синий	\N	379.0	227.0	8.6033	Электро	\N	Вуаль	\N	\N	2	\N	2026-08-26 23:09:51.114566+05	2026-08-26 23:09:51.114566+05
137	67	window	2	Австрийские	{Габардин}	{Бархатные}	Бежевый	\N	167.0	227.0	3.7909	Потолочный пластик	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:51.115049+05	2026-08-26 23:09:51.115049+05
138	68	window	0	Римские	{Велюр,Лён}	{Шёлк,"С рисунком"}	Синий	\N	358.0	164.0	5.8712	Потолочный пластик	\N	Шёлковая	\N	\N	1	\N	2026-08-26 23:09:51.151594+05	2026-08-26 23:09:51.151594+05
139	68	window	1	Рулонные	{Габардин}	{Однотонный}	Красный	\N	232.0	141.0	3.2712	Магнитный	\N	Вуаль	\N	\N	1	\N	2026-08-26 23:09:51.152066+05	2026-08-26 23:09:51.152066+05
140	68	window	2	Блэкаут	{Органза}	{"С принтом"}	Золотой	\N	384.0	152.0	5.8368	Потолочный алюминий	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:51.152511+05	2026-08-26 23:09:51.152511+05
141	69	window	0	Японские	{Хлопок}	{Шёлк}	Чёрный	\N	168.0	221.0	3.7128	Круглый металл	\N	Органза	\N	\N	2	\N	2026-08-26 23:09:51.159616+05	2026-08-26 23:09:51.159616+05
142	69	window	1	Ламбрекен	{Атлас,Шёлк}	{Однотонный,Матовый}	Синий	\N	109.0	140.0	1.5260	Профильный алюминий	\N	Полиэстер	\N	\N	1	\N	2026-08-26 23:09:51.160071+05	2026-08-26 23:09:51.160071+05
143	69	door	2	Бамбуковые	{Велюр}	{Глянцевый}	Золотой	\N	350.0	230.0	8.0500	Потолочный алюминий	\N	Шёлковая	\N	\N	2	\N	2026-08-26 23:09:51.1606+05	2026-08-26 23:09:51.1606+05
144	70	window	0	Прямые	{Габардин,Лён}	{Бархатные,Матовый}	Серебряный	\N	175.0	259.0	4.5325	Профильный алюминий	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:51.166332+05	2026-08-26 23:09:51.166332+05
145	70	window	1	Нитяные	{Блэкаут}	{Бархатные}	Серый	\N	243.0	168.0	4.0824	Профильный алюминий	\N	Сетка	\N	\N	2	\N	2026-08-26 23:09:51.166786+05	2026-08-26 23:09:51.166786+05
146	70	window	2	Блэкаут	{Лён,Хлопок}	{Однотонный,"С рисунком"}	Зелёный	\N	96.0	250.0	2.4000	Струнный	\N	Полиэстер	\N	\N	2	\N	2026-08-26 23:09:51.167175+05	2026-08-26 23:09:51.167175+05
\.


--
-- Data for Name: order_photos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_photos (id, order_id, stage, storage_key, original_file_name, mime_type, size_bytes, uploaded_by, created_at) FROM stdin;
\.


--
-- Data for Name: order_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_status_history (id, order_id, from_status, to_status, changed_by, comment, created_at) FROM stdin;
55	5	\N	new	26	Заказ создан	2026-08-26 23:09:49.683255+05
56	5	new	pending_admin_review	26	\N	2026-08-26 23:09:49.687729+05
57	6	\N	new	28	Заказ создан	2026-08-26 23:09:49.697674+05
58	6	new	pending_admin_review	28	\N	2026-08-26 23:09:49.698953+05
59	7	\N	new	27	Заказ создан	2026-08-26 23:09:49.705356+05
60	7	new	pending_admin_review	27	\N	2026-08-26 23:09:49.707484+05
61	8	\N	new	26	Заказ создан	2026-08-26 23:09:49.711572+05
62	8	new	pending_admin_review	26	\N	2026-08-26 23:09:49.713693+05
63	9	\N	new	27	Заказ создан	2026-08-26 23:09:49.718346+05
64	9	new	pending_admin_review	27	\N	2026-08-26 23:09:49.719436+05
65	10	\N	new	27	Заказ создан	2026-08-26 23:09:49.726138+05
66	10	new	pending_admin_review	27	\N	2026-08-26 23:09:49.726514+05
67	10	pending_admin_review	rejected_to_ceo	44	Не согласована цена с клиентом	2026-08-26 23:09:49.728745+05
68	11	\N	new	26	Заказ создан	2026-08-26 23:09:49.736604+05
69	11	new	pending_admin_review	26	\N	2026-08-26 23:09:49.737934+05
70	11	pending_admin_review	rejected_to_ceo	44	Не согласована цена с клиентом	2026-08-26 23:09:49.74046+05
71	12	\N	new	29	Заказ создан	2026-08-26 23:09:49.747323+05
72	12	new	pending_admin_review	29	\N	2026-08-26 23:09:49.748444+05
73	12	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.755149+05
74	13	\N	new	29	Заказ создан	2026-08-26 23:09:49.761893+05
75	13	new	pending_admin_review	29	\N	2026-08-26 23:09:49.762249+05
76	13	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.767646+05
77	14	\N	new	27	Заказ создан	2026-08-26 23:09:49.77418+05
78	14	new	pending_admin_review	27	\N	2026-08-26 23:09:49.774549+05
79	14	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.779411+05
80	15	\N	new	27	Заказ создан	2026-08-26 23:09:49.785168+05
81	15	new	pending_admin_review	27	\N	2026-08-26 23:09:49.786411+05
82	15	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.791244+05
83	16	\N	new	27	Заказ создан	2026-08-26 23:09:49.796638+05
84	16	new	pending_admin_review	27	\N	2026-08-26 23:09:49.797793+05
85	16	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.802498+05
86	16	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:49.805079+05
87	17	\N	new	29	Заказ создан	2026-08-26 23:09:49.811586+05
88	17	new	pending_admin_review	29	\N	2026-08-26 23:09:49.812359+05
89	17	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.817407+05
90	17	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:49.819969+05
91	18	\N	new	29	Заказ создан	2026-08-26 23:09:49.825914+05
92	18	new	pending_admin_review	29	\N	2026-08-26 23:09:49.826309+05
93	18	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.83098+05
94	18	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:49.833413+05
95	19	\N	new	29	Заказ создан	2026-08-26 23:09:49.83879+05
96	19	new	pending_admin_review	29	\N	2026-08-26 23:09:49.839187+05
97	19	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.844464+05
98	19	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:49.847029+05
99	19	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:49.849223+05
100	20	\N	new	27	Заказ создан	2026-08-26 23:09:49.856687+05
101	20	new	pending_admin_review	27	\N	2026-08-26 23:09:49.857174+05
102	20	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.86228+05
103	20	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:49.864771+05
104	20	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:49.867268+05
105	21	\N	new	28	Заказ создан	2026-08-26 23:09:49.87399+05
106	21	new	pending_admin_review	28	\N	2026-08-26 23:09:49.874341+05
107	21	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.879532+05
108	21	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:49.881656+05
109	21	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:49.883962+05
110	22	\N	new	27	Заказ создан	2026-08-26 23:09:49.889306+05
111	22	new	pending_admin_review	27	\N	2026-08-26 23:09:49.889774+05
112	22	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.894644+05
113	22	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:49.896979+05
114	22	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:49.899218+05
115	23	\N	new	29	Заказ создан	2026-08-26 23:09:49.904192+05
116	23	new	pending_admin_review	29	\N	2026-08-26 23:09:49.904554+05
117	23	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.908884+05
118	23	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:49.911201+05
119	23	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:49.913909+05
120	24	\N	new	28	Заказ создан	2026-08-26 23:09:49.920611+05
121	24	new	pending_admin_review	28	\N	2026-08-26 23:09:49.921018+05
122	24	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.92628+05
123	24	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:49.928569+05
124	24	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:49.930942+05
125	25	\N	new	28	Заказ создан	2026-08-26 23:09:49.935969+05
126	25	new	pending_admin_review	28	\N	2026-08-26 23:09:49.93653+05
127	25	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.941155+05
128	25	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:49.94377+05
129	25	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:49.945965+05
130	25	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:49.951252+05
131	26	\N	new	27	Заказ создан	2026-08-26 23:09:49.956096+05
132	26	new	pending_admin_review	27	\N	2026-08-26 23:09:49.956415+05
133	26	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.961608+05
134	26	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:49.964148+05
135	26	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:49.966735+05
136	26	pending_sewing_assignment	sewing_in_progress	34	\N	2026-08-26 23:09:49.97324+05
137	27	\N	new	27	Заказ создан	2026-08-26 23:09:49.979613+05
138	27	new	pending_admin_review	27	\N	2026-08-26 23:09:49.980106+05
139	27	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:49.984772+05
140	27	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:49.987521+05
141	27	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:49.990128+05
142	27	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:49.995263+05
143	28	\N	new	27	Заказ создан	2026-08-26 23:09:50.000922+05
144	28	new	pending_admin_review	27	\N	2026-08-26 23:09:50.001324+05
145	28	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.006319+05
146	28	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.009036+05
147	28	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.011585+05
148	28	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:50.016557+05
149	29	\N	new	26	Заказ создан	2026-08-26 23:09:50.021225+05
150	29	new	pending_admin_review	26	\N	2026-08-26 23:09:50.021699+05
151	29	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.02613+05
152	29	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.028819+05
153	29	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.031273+05
154	29	pending_sewing_assignment	sewing_in_progress	37	\N	2026-08-26 23:09:50.036691+05
155	30	\N	new	27	Заказ создан	2026-08-26 23:09:50.04253+05
156	30	new	pending_admin_review	27	\N	2026-08-26 23:09:50.042999+05
157	30	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.047662+05
158	30	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.050027+05
159	30	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.052228+05
160	30	pending_sewing_assignment	sewing_in_progress	34	\N	2026-08-26 23:09:50.056866+05
161	31	\N	new	28	Заказ создан	2026-08-26 23:09:50.06121+05
162	31	new	pending_admin_review	28	\N	2026-08-26 23:09:50.06153+05
163	31	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.066312+05
164	31	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.069085+05
165	31	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.071626+05
166	31	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:50.076809+05
167	32	\N	new	28	Заказ создан	2026-08-26 23:09:50.081793+05
168	32	new	pending_admin_review	28	\N	2026-08-26 23:09:50.082391+05
169	32	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.086959+05
170	32	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.089415+05
171	32	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.092017+05
172	32	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:50.097436+05
173	32	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:50.100309+05
174	33	\N	new	28	Заказ создан	2026-08-26 23:09:50.106099+05
175	33	new	pending_admin_review	28	\N	2026-08-26 23:09:50.106529+05
176	33	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.111257+05
177	33	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.113512+05
178	33	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.115936+05
179	33	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:50.121068+05
180	33	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:50.123554+05
181	34	\N	new	28	Заказ создан	2026-08-26 23:09:50.127167+05
182	34	new	pending_admin_review	28	\N	2026-08-26 23:09:50.127508+05
183	34	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.132178+05
184	34	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.134725+05
185	34	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.137025+05
186	34	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:50.141865+05
187	34	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:50.144318+05
188	35	\N	new	29	Заказ создан	2026-08-26 23:09:50.149746+05
189	35	new	pending_admin_review	29	\N	2026-08-26 23:09:50.150213+05
190	35	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.154779+05
191	35	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.15695+05
192	35	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.159455+05
193	35	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.164419+05
194	35	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.166914+05
195	35	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.169311+05
196	36	\N	new	28	Заказ создан	2026-08-26 23:09:50.173761+05
197	36	new	pending_admin_review	28	\N	2026-08-26 23:09:50.174173+05
198	36	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.178581+05
199	36	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.180859+05
200	36	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.187096+05
201	36	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:50.191438+05
202	36	sewing_in_progress	sewing_done	38	\N	2026-08-26 23:09:50.198928+05
203	36	sewing_done	pending_qc	38	\N	2026-08-26 23:09:50.201589+05
204	37	\N	new	26	Заказ создан	2026-08-26 23:09:50.206537+05
205	37	new	pending_admin_review	26	\N	2026-08-26 23:09:50.206976+05
206	37	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.211466+05
207	37	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.213895+05
208	37	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.216571+05
209	37	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.221581+05
210	37	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.223773+05
211	37	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.225871+05
212	38	\N	new	29	Заказ создан	2026-08-26 23:09:50.230411+05
213	38	new	pending_admin_review	29	\N	2026-08-26 23:09:50.230694+05
214	38	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.234803+05
215	38	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.237184+05
216	38	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.238888+05
217	38	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:50.243112+05
218	38	sewing_in_progress	sewing_done	38	\N	2026-08-26 23:09:50.244896+05
219	38	sewing_done	pending_qc	38	\N	2026-08-26 23:09:50.246918+05
220	39	\N	new	26	Заказ создан	2026-08-26 23:09:50.249817+05
221	39	new	pending_admin_review	26	\N	2026-08-26 23:09:50.250227+05
222	39	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.25387+05
223	39	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.255769+05
224	39	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.257864+05
225	39	pending_sewing_assignment	sewing_in_progress	37	\N	2026-08-26 23:09:50.261916+05
226	39	sewing_in_progress	sewing_done	37	\N	2026-08-26 23:09:50.263764+05
227	39	sewing_done	pending_qc	37	\N	2026-08-26 23:09:50.265928+05
228	40	\N	new	26	Заказ создан	2026-08-26 23:09:50.269687+05
229	40	new	pending_admin_review	26	\N	2026-08-26 23:09:50.270011+05
230	40	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.27396+05
231	40	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.276013+05
232	40	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.277694+05
233	40	pending_sewing_assignment	sewing_in_progress	35	\N	2026-08-26 23:09:50.281699+05
234	40	sewing_in_progress	sewing_done	35	\N	2026-08-26 23:09:50.283936+05
235	40	sewing_done	pending_qc	35	\N	2026-08-26 23:09:50.286176+05
236	40	pending_qc	qc_failed	39	Кривой шов по нижнему краю	2026-08-26 23:09:50.288598+05
237	41	\N	new	27	Заказ создан	2026-08-26 23:09:50.294129+05
238	41	new	pending_admin_review	27	\N	2026-08-26 23:09:50.29449+05
239	41	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.299043+05
240	41	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.30134+05
241	41	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.303243+05
242	41	pending_sewing_assignment	sewing_in_progress	35	\N	2026-08-26 23:09:50.308378+05
243	41	sewing_in_progress	sewing_done	35	\N	2026-08-26 23:09:50.310275+05
244	41	sewing_done	pending_qc	35	\N	2026-08-26 23:09:50.312503+05
245	41	pending_qc	qc_failed	39	Замят ламбрекен при упаковке	2026-08-26 23:09:50.3144+05
246	42	\N	new	29	Заказ создан	2026-08-26 23:09:50.321211+05
247	42	new	pending_admin_review	29	\N	2026-08-26 23:09:50.321774+05
248	42	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.325771+05
249	42	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.327681+05
250	42	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.329741+05
251	42	pending_sewing_assignment	sewing_in_progress	37	\N	2026-08-26 23:09:50.333772+05
252	42	sewing_in_progress	sewing_done	37	\N	2026-08-26 23:09:50.335758+05
253	42	sewing_done	pending_qc	37	\N	2026-08-26 23:09:50.337879+05
254	42	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.340347+05
255	43	\N	new	26	Заказ создан	2026-08-26 23:09:50.34493+05
256	43	new	pending_admin_review	26	\N	2026-08-26 23:09:50.345237+05
257	43	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.348958+05
258	43	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.351191+05
259	43	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.353045+05
260	43	pending_sewing_assignment	sewing_in_progress	37	\N	2026-08-26 23:09:50.357055+05
261	43	sewing_in_progress	sewing_done	37	\N	2026-08-26 23:09:50.359287+05
262	43	sewing_done	pending_qc	37	\N	2026-08-26 23:09:50.361149+05
263	43	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.363148+05
264	44	\N	new	26	Заказ создан	2026-08-26 23:09:50.367277+05
265	44	new	pending_admin_review	26	\N	2026-08-26 23:09:50.367587+05
266	44	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.37164+05
267	44	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.373575+05
268	44	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.375519+05
269	44	pending_sewing_assignment	sewing_in_progress	37	\N	2026-08-26 23:09:50.379413+05
270	44	sewing_in_progress	sewing_done	37	\N	2026-08-26 23:09:50.381347+05
271	44	sewing_done	pending_qc	37	\N	2026-08-26 23:09:50.383461+05
272	44	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.385161+05
273	45	\N	new	28	Заказ создан	2026-08-26 23:09:50.38827+05
274	45	new	pending_admin_review	28	\N	2026-08-26 23:09:50.388541+05
275	45	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.392432+05
276	45	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.39481+05
277	45	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.396834+05
278	45	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:50.400945+05
279	45	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:50.40294+05
280	45	sewing_done	pending_qc	33	\N	2026-08-26 23:09:50.405588+05
281	45	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.408146+05
282	45	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.410104+05
283	46	\N	new	27	Заказ создан	2026-08-26 23:09:50.414624+05
284	46	new	pending_admin_review	27	\N	2026-08-26 23:09:50.415133+05
285	46	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.419454+05
286	46	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.421527+05
287	46	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.42343+05
288	46	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.42752+05
289	46	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.429934+05
290	46	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.43181+05
291	46	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.43415+05
292	46	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.43661+05
293	47	\N	new	28	Заказ создан	2026-08-26 23:09:50.4434+05
294	47	new	pending_admin_review	28	\N	2026-08-26 23:09:50.443746+05
295	47	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.447365+05
296	47	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.449102+05
297	47	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.451054+05
298	47	pending_sewing_assignment	sewing_in_progress	34	\N	2026-08-26 23:09:50.454952+05
299	47	sewing_in_progress	sewing_done	34	\N	2026-08-26 23:09:50.456738+05
300	47	sewing_done	pending_qc	34	\N	2026-08-26 23:09:50.458791+05
301	47	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.461253+05
302	47	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.46431+05
303	48	\N	new	28	Заказ создан	2026-08-26 23:09:50.469524+05
304	48	new	pending_admin_review	28	\N	2026-08-26 23:09:50.469812+05
305	48	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.47374+05
306	48	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.475738+05
307	48	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.477531+05
308	48	pending_sewing_assignment	sewing_in_progress	34	\N	2026-08-26 23:09:50.48132+05
309	48	sewing_in_progress	sewing_done	34	\N	2026-08-26 23:09:50.483584+05
310	48	sewing_done	pending_qc	34	\N	2026-08-26 23:09:50.485353+05
311	48	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.487587+05
312	48	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.489504+05
313	49	\N	new	29	Заказ создан	2026-08-26 23:09:50.494679+05
314	49	new	pending_admin_review	29	\N	2026-08-26 23:09:50.494972+05
315	49	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.498719+05
316	49	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.50074+05
317	49	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.502419+05
318	49	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:50.508707+05
319	49	sewing_in_progress	sewing_done	38	\N	2026-08-26 23:09:50.510577+05
320	49	sewing_done	pending_qc	38	\N	2026-08-26 23:09:50.512603+05
321	49	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.514667+05
322	49	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.516785+05
323	49	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.520925+05
324	50	\N	new	26	Заказ создан	2026-08-26 23:09:50.52506+05
325	50	new	pending_admin_review	26	\N	2026-08-26 23:09:50.525437+05
326	50	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.529626+05
327	50	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.531296+05
328	50	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.533686+05
329	50	pending_sewing_assignment	sewing_in_progress	38	\N	2026-08-26 23:09:50.537433+05
330	50	sewing_in_progress	sewing_done	38	\N	2026-08-26 23:09:50.53933+05
331	50	sewing_done	pending_qc	38	\N	2026-08-26 23:09:50.541323+05
332	50	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.543404+05
333	50	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.545341+05
334	50	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.549417+05
335	51	\N	new	29	Заказ создан	2026-08-26 23:09:50.55516+05
336	51	new	pending_admin_review	29	\N	2026-08-26 23:09:50.555469+05
337	51	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.559243+05
338	51	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.561096+05
339	51	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.562878+05
340	51	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.566518+05
341	51	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.568548+05
342	51	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.570276+05
343	51	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.572422+05
344	51	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.574502+05
345	51	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.57897+05
346	52	\N	new	26	Заказ создан	2026-08-26 23:09:50.583952+05
347	52	new	pending_admin_review	26	\N	2026-08-26 23:09:50.584224+05
348	52	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.587835+05
349	52	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.589995+05
350	52	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.591638+05
351	52	pending_sewing_assignment	sewing_in_progress	35	\N	2026-08-26 23:09:50.595657+05
352	52	sewing_in_progress	sewing_done	35	\N	2026-08-26 23:09:50.597865+05
353	52	sewing_done	pending_qc	35	\N	2026-08-26 23:09:50.599593+05
354	52	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.60164+05
355	52	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.603366+05
356	52	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.607486+05
357	52	installation_assigned	installation_in_progress	43	\N	2026-08-26 23:09:50.609353+05
358	53	\N	new	26	Заказ создан	2026-08-26 23:09:50.613743+05
359	53	new	pending_admin_review	26	\N	2026-08-26 23:09:50.614028+05
360	53	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.619024+05
361	53	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.621723+05
362	53	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.624296+05
363	53	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.628332+05
364	53	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.630267+05
365	53	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.632008+05
366	53	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.634266+05
367	53	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.636358+05
368	53	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.641378+05
369	53	installation_assigned	installation_in_progress	42	\N	2026-08-26 23:09:50.643416+05
370	54	\N	new	29	Заказ создан	2026-08-26 23:09:50.648937+05
371	54	new	pending_admin_review	29	\N	2026-08-26 23:09:50.64922+05
372	54	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.652828+05
373	54	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.655812+05
374	54	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.657889+05
375	54	pending_sewing_assignment	sewing_in_progress	34	\N	2026-08-26 23:09:50.661556+05
376	54	sewing_in_progress	sewing_done	34	\N	2026-08-26 23:09:50.663402+05
377	54	sewing_done	pending_qc	34	\N	2026-08-26 23:09:50.665582+05
378	54	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.667611+05
379	54	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.669915+05
380	54	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.674284+05
381	54	installation_assigned	installation_in_progress	41	\N	2026-08-26 23:09:50.677133+05
382	54	installation_in_progress	installation_done	41	\N	2026-08-26 23:09:50.679402+05
383	54	installation_done	completed	44	\N	2026-08-26 23:09:50.681698+05
384	55	\N	new	28	Заказ создан	2026-08-26 23:09:50.686281+05
385	55	new	pending_admin_review	28	\N	2026-08-26 23:09:50.686692+05
386	55	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.690387+05
387	55	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.692343+05
388	55	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.694483+05
389	55	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.698539+05
390	55	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.700444+05
391	55	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.702359+05
392	55	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.704553+05
393	55	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.70642+05
394	55	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.711112+05
395	55	installation_assigned	installation_in_progress	42	\N	2026-08-26 23:09:50.713598+05
396	55	installation_in_progress	installation_done	42	\N	2026-08-26 23:09:50.715859+05
397	55	installation_done	completed	44	\N	2026-08-26 23:09:50.717701+05
398	56	\N	new	26	Заказ создан	2026-08-26 23:09:50.722918+05
399	56	new	pending_admin_review	26	\N	2026-08-26 23:09:50.72321+05
400	56	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.727398+05
401	56	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.729679+05
402	56	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.731484+05
403	56	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.736528+05
404	56	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.738804+05
405	56	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.741158+05
406	56	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.743285+05
407	56	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.745312+05
408	56	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.749324+05
409	56	installation_assigned	installation_in_progress	43	\N	2026-08-26 23:09:50.751512+05
410	56	installation_in_progress	installation_done	43	\N	2026-08-26 23:09:50.753256+05
411	56	installation_done	completed	44	\N	2026-08-26 23:09:50.755508+05
412	57	\N	new	29	Заказ создан	2026-08-26 23:09:50.761331+05
413	57	new	pending_admin_review	29	\N	2026-08-26 23:09:50.761671+05
414	57	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.765133+05
415	57	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.766972+05
416	57	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.769013+05
417	57	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.772744+05
418	57	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.774372+05
419	57	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.77644+05
420	57	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.778284+05
421	57	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.780316+05
422	57	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.78431+05
423	57	installation_assigned	installation_in_progress	41	\N	2026-08-26 23:09:50.786582+05
424	57	installation_in_progress	installation_done	41	\N	2026-08-26 23:09:50.788457+05
425	57	installation_done	completed	44	\N	2026-08-26 23:09:50.791004+05
426	58	\N	new	26	Заказ создан	2026-08-26 23:09:50.795018+05
427	58	new	pending_admin_review	26	\N	2026-08-26 23:09:50.795296+05
428	58	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.799179+05
429	58	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:50.801428+05
430	58	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:50.80331+05
431	58	pending_sewing_assignment	sewing_in_progress	34	\N	2026-08-26 23:09:50.80751+05
432	58	sewing_in_progress	sewing_done	34	\N	2026-08-26 23:09:50.809479+05
433	58	sewing_done	pending_qc	34	\N	2026-08-26 23:09:50.811487+05
434	58	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.813343+05
435	58	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.815986+05
436	58	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.822303+05
437	58	installation_assigned	installation_in_progress	41	\N	2026-08-26 23:09:50.824536+05
438	58	installation_in_progress	installation_done	41	\N	2026-08-26 23:09:50.826847+05
439	58	installation_done	completed	44	\N	2026-08-26 23:09:50.828944+05
440	59	\N	new	28	Заказ создан	2026-08-26 23:09:50.834264+05
441	59	new	pending_admin_review	28	\N	2026-08-26 23:09:50.834537+05
442	59	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.838525+05
443	59	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.840564+05
444	59	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.84244+05
445	59	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:50.84658+05
446	59	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:50.848682+05
447	59	sewing_done	pending_qc	33	\N	2026-08-26 23:09:50.850772+05
448	59	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.85272+05
449	59	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.854859+05
450	59	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.858899+05
451	59	installation_assigned	installation_in_progress	43	\N	2026-08-26 23:09:50.86084+05
452	59	installation_in_progress	installation_done	43	\N	2026-08-26 23:09:50.862912+05
453	59	installation_done	completed	44	\N	2026-08-26 23:09:50.86491+05
454	60	\N	new	28	Заказ создан	2026-08-26 23:09:50.868831+05
455	60	new	pending_admin_review	28	\N	2026-08-26 23:09:50.869161+05
456	60	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.87325+05
457	60	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.876044+05
458	60	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.87792+05
459	60	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:50.88179+05
460	60	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:50.884002+05
461	60	sewing_done	pending_qc	36	\N	2026-08-26 23:09:50.885773+05
462	60	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.887884+05
463	60	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.889972+05
464	60	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.893938+05
465	60	installation_assigned	installation_in_progress	42	\N	2026-08-26 23:09:50.895985+05
466	60	installation_in_progress	installation_done	42	\N	2026-08-26 23:09:50.898553+05
467	60	installation_done	completed	44	\N	2026-08-26 23:09:50.900672+05
468	61	\N	new	27	Заказ создан	2026-08-26 23:09:50.905637+05
469	61	new	pending_admin_review	27	\N	2026-08-26 23:09:50.905913+05
470	61	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.909591+05
471	61	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.911577+05
472	61	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.913273+05
473	61	pending_sewing_assignment	sewing_in_progress	35	\N	2026-08-26 23:09:50.917334+05
474	61	sewing_in_progress	sewing_done	35	\N	2026-08-26 23:09:50.919392+05
475	61	sewing_done	pending_qc	35	\N	2026-08-26 23:09:50.921015+05
476	61	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.922977+05
477	61	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.924715+05
478	61	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.929357+05
479	61	installation_assigned	installation_in_progress	43	\N	2026-08-26 23:09:50.931372+05
480	61	installation_in_progress	installation_done	43	\N	2026-08-26 23:09:50.933507+05
481	61	installation_done	completed	44	\N	2026-08-26 23:09:50.935244+05
482	62	\N	new	27	Заказ создан	2026-08-26 23:09:50.939972+05
483	62	new	pending_admin_review	27	\N	2026-08-26 23:09:50.940376+05
484	62	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.943902+05
485	62	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:50.945793+05
486	62	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:50.948102+05
487	62	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:50.95202+05
488	62	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:50.953817+05
489	62	sewing_done	pending_qc	33	\N	2026-08-26 23:09:50.955701+05
490	62	pending_qc	qc_passed	40	\N	2026-08-26 23:09:50.957783+05
491	62	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:50.959916+05
492	62	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.963984+05
493	62	installation_assigned	installation_in_progress	43	\N	2026-08-26 23:09:50.966369+05
494	62	installation_in_progress	installation_done	43	\N	2026-08-26 23:09:50.968449+05
495	62	installation_done	completed	44	\N	2026-08-26 23:09:50.97038+05
496	63	\N	new	27	Заказ создан	2026-08-26 23:09:50.974091+05
497	63	new	pending_admin_review	27	\N	2026-08-26 23:09:50.974359+05
498	63	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:50.978201+05
499	63	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:50.980788+05
500	63	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:50.983229+05
501	63	pending_sewing_assignment	sewing_in_progress	35	\N	2026-08-26 23:09:50.987324+05
502	63	sewing_in_progress	sewing_done	35	\N	2026-08-26 23:09:50.989076+05
503	63	sewing_done	pending_qc	35	\N	2026-08-26 23:09:50.991136+05
504	63	pending_qc	qc_passed	39	\N	2026-08-26 23:09:50.992911+05
505	63	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:50.994976+05
506	63	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:50.998882+05
507	63	installation_assigned	installation_in_progress	41	\N	2026-08-26 23:09:51.001067+05
508	63	installation_in_progress	installation_done	41	\N	2026-08-26 23:09:51.003357+05
509	63	installation_done	completed	44	\N	2026-08-26 23:09:51.005916+05
510	64	\N	new	29	Заказ создан	2026-08-26 23:09:51.010735+05
511	64	new	pending_admin_review	29	\N	2026-08-26 23:09:51.01122+05
512	64	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:51.014682+05
513	64	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:51.016555+05
514	64	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:51.018467+05
515	64	pending_sewing_assignment	sewing_in_progress	37	\N	2026-08-26 23:09:51.02243+05
516	64	sewing_in_progress	sewing_done	37	\N	2026-08-26 23:09:51.02432+05
517	64	sewing_done	pending_qc	37	\N	2026-08-26 23:09:51.026997+05
518	64	pending_qc	qc_passed	39	\N	2026-08-26 23:09:51.029212+05
519	64	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:51.031493+05
520	64	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:51.035493+05
521	64	installation_assigned	installation_in_progress	43	\N	2026-08-26 23:09:51.037532+05
522	64	installation_in_progress	installation_done	43	\N	2026-08-26 23:09:51.039312+05
523	64	installation_done	completed	44	\N	2026-08-26 23:09:51.041315+05
524	65	\N	new	28	Заказ создан	2026-08-26 23:09:51.046446+05
525	65	new	pending_admin_review	28	\N	2026-08-26 23:09:51.046839+05
526	65	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:51.050474+05
527	65	measurement_assigned	measurement_done	31	\N	2026-08-26 23:09:51.052426+05
528	65	measurement_done	pending_sewing_assignment	31	\N	2026-08-26 23:09:51.054421+05
529	65	pending_sewing_assignment	sewing_in_progress	36	\N	2026-08-26 23:09:51.058613+05
530	65	sewing_in_progress	sewing_done	36	\N	2026-08-26 23:09:51.060299+05
531	65	sewing_done	pending_qc	36	\N	2026-08-26 23:09:51.062314+05
532	65	pending_qc	qc_passed	40	\N	2026-08-26 23:09:51.064224+05
533	65	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:51.066325+05
534	65	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:51.070507+05
535	65	installation_assigned	installation_in_progress	42	\N	2026-08-26 23:09:51.072784+05
536	65	installation_in_progress	installation_done	42	\N	2026-08-26 23:09:51.074513+05
537	65	installation_done	completed	44	\N	2026-08-26 23:09:51.076651+05
538	66	\N	new	29	Заказ создан	2026-08-26 23:09:51.080889+05
539	66	new	pending_admin_review	29	\N	2026-08-26 23:09:51.081162+05
540	66	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:51.084856+05
541	66	measurement_assigned	measurement_done	32	\N	2026-08-26 23:09:51.087037+05
542	66	measurement_done	pending_sewing_assignment	32	\N	2026-08-26 23:09:51.088737+05
543	66	pending_sewing_assignment	sewing_in_progress	35	\N	2026-08-26 23:09:51.092499+05
544	66	sewing_in_progress	sewing_done	35	\N	2026-08-26 23:09:51.094624+05
545	66	sewing_done	pending_qc	35	\N	2026-08-26 23:09:51.096383+05
546	66	pending_qc	qc_passed	40	\N	2026-08-26 23:09:51.098438+05
547	66	qc_passed	pending_installation_assignment	40	\N	2026-08-26 23:09:51.100296+05
548	66	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:51.104809+05
549	66	installation_assigned	installation_in_progress	41	\N	2026-08-26 23:09:51.106951+05
550	66	installation_in_progress	installation_done	41	\N	2026-08-26 23:09:51.109093+05
551	66	installation_done	completed	44	\N	2026-08-26 23:09:51.110894+05
552	67	\N	new	29	Заказ создан	2026-08-26 23:09:51.115397+05
553	67	new	pending_admin_review	29	\N	2026-08-26 23:09:51.115677+05
554	67	pending_admin_review	measurement_assigned	44	\N	2026-08-26 23:09:51.119142+05
555	67	measurement_assigned	measurement_done	30	\N	2026-08-26 23:09:51.1208+05
556	67	measurement_done	pending_sewing_assignment	30	\N	2026-08-26 23:09:51.122913+05
557	67	pending_sewing_assignment	sewing_in_progress	33	\N	2026-08-26 23:09:51.129572+05
558	67	sewing_in_progress	sewing_done	33	\N	2026-08-26 23:09:51.131388+05
559	67	sewing_done	pending_qc	33	\N	2026-08-26 23:09:51.133407+05
560	67	pending_qc	qc_passed	39	\N	2026-08-26 23:09:51.13515+05
561	67	qc_passed	pending_installation_assignment	39	\N	2026-08-26 23:09:51.137379+05
562	67	pending_installation_assignment	installation_assigned	44	\N	2026-08-26 23:09:51.141522+05
563	67	installation_assigned	installation_in_progress	42	\N	2026-08-26 23:09:51.143704+05
564	67	installation_in_progress	installation_done	42	\N	2026-08-26 23:09:51.145616+05
565	67	installation_done	completed	44	\N	2026-08-26 23:09:51.147837+05
566	68	\N	new	28	Заказ создан	2026-08-26 23:09:51.15285+05
567	68	new	pending_admin_review	28	\N	2026-08-26 23:09:51.153141+05
568	68	pending_admin_review	cancelled	44	Клиент выбрал другого подрядчика	2026-08-26 23:09:51.155129+05
569	69	\N	new	26	Заказ создан	2026-08-26 23:09:51.161134+05
570	69	new	pending_admin_review	26	\N	2026-08-26 23:09:51.161623+05
571	69	pending_admin_review	cancelled	44	Клиент отказался от заказа	2026-08-26 23:09:51.163299+05
572	70	\N	new	26	Заказ создан	2026-08-26 23:09:51.167505+05
573	70	new	pending_admin_review	26	\N	2026-08-26 23:09:51.168055+05
574	70	pending_admin_review	cancelled	44	Клиент выбрал другого подрядчика	2026-08-26 23:09:51.169858+05
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, branch_id, status, priority, client_name, client_phone, client_comment, install_address, install_latitude, install_longitude, deadline, work_price, deposit, created_by, master_id, sewer_id, qc_id, installer_id, completed_at, cancelled_at, cancellation_reason, created_at, updated_at) FROM stdin;
5	8	pending_admin_review	normal	Камолова Дилноза	+998902582982	Просили не шуметь до 10 утра	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-09-09	13900000.00	7304361.00	26	\N	\N	\N	\N	\N	\N	\N	2026-08-07 23:09:49.68+05	2026-08-26 23:09:49.688+05
6	1	pending_admin_review	normal	Каримова Дилором	+998904307528	\N	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-07-19	15000000.00	8985062.00	28	\N	\N	\N	\N	\N	\N	\N	2026-06-10 23:09:49.693+05	2026-08-26 23:09:49.699+05
7	1	pending_admin_review	urgent	Камолова Дилноза	+998903878314	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-09-11	19500000.00	7338693.00	27	\N	\N	\N	\N	\N	\N	\N	2026-08-08 23:09:49.702+05	2026-08-26 23:09:49.707+05
8	8	pending_admin_review	critical	Икрамова Нодира	+998906993305	Просили не шуметь до 10 утра	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-10-02	6800000.00	2038949.00	26	\N	\N	\N	\N	\N	\N	\N	2026-08-18 23:09:49.709+05	2026-08-26 23:09:49.714+05
9	1	pending_admin_review	critical	Абдуллаева Севара	+998902340739	\N	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-08-30	10300000.00	3200913.00	27	\N	\N	\N	\N	\N	\N	\N	2026-07-18 23:09:49.716+05	2026-08-26 23:09:49.719+05
10	8	rejected_to_ceo	normal	Хамидова Зарина	+998907057786	Просили не шуметь до 10 утра	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-07-01	4900000.00	3203078.00	27	\N	\N	\N	\N	\N	\N	\N	2026-06-14 23:09:49.723+05	2026-08-26 23:09:49.729+05
11	1	rejected_to_ceo	normal	Камолова Дилноза	+998905891121	Просили не шуметь до 10 утра	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-08-18	19600000.00	11410659.00	26	\N	\N	\N	\N	\N	\N	\N	2026-08-07 23:09:49.733+05	2026-08-26 23:09:49.74+05
12	8	measurement_assigned	normal	Камолова Дилноза	+998908814982	\N	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-08-05	16900000.00	10965037.00	29	30	\N	\N	\N	\N	\N	\N	2026-07-07 23:09:49.744+05	2026-08-26 23:09:49.755+05
13	8	measurement_assigned	critical	Тураева Мохира	+998902691530	Просили не шуметь до 10 утра	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-08-01	13100000.00	5273296.00	29	31	\N	\N	\N	\N	\N	\N	2026-07-19 23:09:49.759+05	2026-08-26 23:09:49.768+05
14	8	measurement_assigned	normal	Абдуллаева Севара	+998907016741	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-10-03	4300000.00	864318.00	27	31	\N	\N	\N	\N	\N	\N	2026-08-24 23:09:49.772+05	2026-08-26 23:09:49.779+05
15	1	measurement_assigned	normal	Нурматов Шерзод	+998906541749	Просили не шуметь до 10 утра	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-06-29	6000000.00	3354598.00	27	30	\N	\N	\N	\N	\N	\N	2026-06-12 23:09:49.782+05	2026-08-26 23:09:49.791+05
16	1	measurement_done	normal	Абдуллаева Севара	+998904111837	Просили не шуметь до 10 утра	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-09-14	13400000.00	7992004.00	27	30	\N	\N	\N	\N	\N	\N	2026-08-21 23:09:49.793+05	2026-08-26 23:09:49.805+05
17	1	measurement_done	normal	Собирова Гульнара	+998908707298	\N	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-08-28	7500000.00	2725704.00	29	32	\N	\N	\N	\N	\N	\N	2026-07-19 23:09:49.809+05	2026-08-26 23:09:49.82+05
18	8	measurement_done	normal	Салимова Гулбахор	+998903638851	Просили не шуметь до 10 утра	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-08-27	3100000.00	1897944.00	29	32	\N	\N	\N	\N	\N	\N	2026-07-17 23:09:49.822+05	2026-08-26 23:09:49.833+05
19	1	pending_sewing_assignment	normal	Собирова Гульнара	+998902344542	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-08-30	9100000.00	6304269.00	29	30	\N	\N	\N	\N	\N	\N	2026-07-16 23:09:49.837+05	2026-08-26 23:09:49.851+05
20	8	pending_sewing_assignment	urgent	Раззакова Малика	+998901771746	Просили не шуметь до 10 утра	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-09-16	10200000.00	3534157.00	27	32	\N	\N	\N	\N	\N	\N	2026-08-24 23:09:49.854+05	2026-08-26 23:09:49.867+05
21	1	pending_sewing_assignment	urgent	Икрамова Нодира	+998909906444	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-08-30	8000000.00	4843629.00	28	32	\N	\N	\N	\N	\N	\N	2026-08-05 23:09:49.87+05	2026-08-26 23:09:49.884+05
22	8	pending_sewing_assignment	normal	Салимова Гулбахор	+998901049766	Просили не шуметь до 10 утра	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-08-04	12000000.00	8277306.00	27	31	\N	\N	\N	\N	\N	\N	2026-06-25 23:09:49.886+05	2026-08-26 23:09:49.899+05
23	1	pending_sewing_assignment	normal	Нурматов Шерзод	+998902042639	\N	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-06-21	22000000.00	11627190.00	29	32	\N	\N	\N	\N	\N	\N	2026-06-09 23:09:49.902+05	2026-08-26 23:09:49.914+05
24	8	pending_sewing_assignment	urgent	Мирзоева Феруза	+998902739394	\N	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-08-25	10200000.00	5943065.00	28	30	\N	\N	\N	\N	\N	\N	2026-08-02 23:09:49.918+05	2026-08-26 23:09:49.931+05
25	1	sewing_in_progress	critical	Икрамова Нодира	+998906956571	\N	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-08-08	7600000.00	3917367.00	28	31	38	\N	\N	\N	\N	\N	2026-07-15 23:09:49.934+05	2026-08-26 23:09:49.951+05
26	1	sewing_in_progress	urgent	Нурматов Шерзод	+998903669204	Просили не шуметь до 10 утра	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-08-23	12300000.00	7039850.00	27	31	34	\N	\N	\N	\N	\N	2026-07-27 23:09:49.954+05	2026-08-26 23:09:49.973+05
27	1	sewing_in_progress	normal	Тошпулатов Азамат	+998904310064	\N	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-09-20	11600000.00	5995158.00	27	30	36	\N	\N	\N	\N	\N	2026-08-16 23:09:49.977+05	2026-08-26 23:09:49.995+05
28	8	sewing_in_progress	critical	Ахмедов Тимур	+998903914926	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-09-24	10300000.00	7103372.00	27	30	38	\N	\N	\N	\N	\N	2026-08-18 23:09:49.998+05	2026-08-26 23:09:50.016+05
29	1	sewing_in_progress	urgent	Мирзоева Феруза	+998904508749	\N	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-09-07	17600000.00	5163902.00	26	32	37	\N	\N	\N	\N	\N	2026-08-06 23:09:50.019+05	2026-08-26 23:09:50.037+05
30	8	sewing_in_progress	urgent	Юсупов Бахтиёр	+998903789438	\N	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-08-22	17900000.00	6020013.00	27	30	34	\N	\N	\N	\N	\N	2026-08-03 23:09:50.04+05	2026-08-26 23:09:50.057+05
31	1	sewing_in_progress	normal	Нурматов Шерзод	+998908236622	Просили не шуметь до 10 утра	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-06-29	6400000.00	3195272.00	28	31	38	\N	\N	\N	\N	\N	2026-06-03 23:09:50.059+05	2026-08-26 23:09:50.077+05
32	1	sewing_done	urgent	Юсупов Бахтиёр	+998902158985	\N	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-06-28	9000000.00	5975209.00	28	31	33	\N	\N	\N	\N	\N	2026-06-11 23:09:50.079+05	2026-08-26 23:09:50.1+05
33	1	sewing_done	urgent	Тошпулатов Азамат	+998903860011	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-08-12	10400000.00	6042456.00	28	30	33	\N	\N	\N	\N	\N	2026-07-28 23:09:50.104+05	2026-08-26 23:09:50.123+05
34	8	sewing_done	normal	Каримова Дилором	+998905310369	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-09-05	10500000.00	2721488.00	28	32	33	\N	\N	\N	\N	\N	2026-08-22 23:09:50.125+05	2026-08-26 23:09:50.144+05
35	1	pending_qc	normal	Икрамова Нодира	+998902918679	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-09-01	17800000.00	7553514.00	29	32	36	\N	\N	\N	\N	\N	2026-08-13 23:09:50.147+05	2026-08-26 23:09:50.169+05
36	8	pending_qc	critical	Икрамова Нодира	+998907324191	\N	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-08-04	21500000.00	14383227.00	28	30	38	\N	\N	\N	\N	\N	2026-07-19 23:09:50.172+05	2026-08-26 23:09:50.201+05
37	1	pending_qc	normal	Мирзоева Феруза	+998909358567	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-07-21	9000000.00	4310842.00	26	30	36	\N	\N	\N	\N	\N	2026-06-06 23:09:50.205+05	2026-08-26 23:09:50.226+05
38	1	pending_qc	urgent	Бекмуродов Фаррух	+998901232371	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-08-19	19800000.00	8291288.00	29	32	38	\N	\N	\N	\N	\N	2026-07-24 23:09:50.228+05	2026-08-26 23:09:50.247+05
39	8	pending_qc	normal	Хамидова Зарина	+998905412824	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-08-12	12300000.00	6844064.00	26	31	37	\N	\N	\N	\N	\N	2026-07-10 23:09:50.248+05	2026-08-26 23:09:50.266+05
40	8	qc_failed	critical	Хамидова Зарина	+998905231911	Просили не шуметь до 10 утра	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-08-27	3100000.00	1274151.00	26	32	35	39	\N	\N	\N	\N	2026-07-20 23:09:50.267+05	2026-08-26 23:09:50.288+05
41	1	qc_failed	urgent	Эргашев Санжар	+998903580698	\N	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-06-24	18700000.00	7710850.00	27	32	35	39	\N	\N	\N	\N	2026-06-10 23:09:50.292+05	2026-08-26 23:09:50.314+05
42	8	qc_passed	normal	Икрамова Нодира	+998908391948	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-08-02	18300000.00	11497051.00	29	31	37	40	\N	\N	\N	\N	2026-07-18 23:09:50.316+05	2026-08-26 23:09:50.34+05
43	1	qc_passed	urgent	Салимова Гулбахор	+998901355267	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-07-29	19200000.00	10616545.00	26	32	37	40	\N	\N	\N	\N	2026-06-27 23:09:50.342+05	2026-08-26 23:09:50.363+05
44	1	qc_passed	normal	Юлдашев Дониёр	+998902941109	Просили не шуметь до 10 утра	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-09-13	11900000.00	7657473.00	26	30	37	39	\N	\N	\N	\N	2026-08-21 23:09:50.365+05	2026-08-26 23:09:50.385+05
45	8	pending_installation_assignment	normal	Икрамова Нодира	+998907344672	Просили не шуметь до 10 утра	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-09-14	7600000.00	3413937.00	28	31	33	39	\N	\N	\N	\N	2026-08-05 23:09:50.387+05	2026-08-26 23:09:50.41+05
46	8	pending_installation_assignment	normal	Юсупов Бахтиёр	+998902715117	\N	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-09-22	15600000.00	4585792.00	27	32	36	39	\N	\N	\N	\N	2026-08-20 23:09:50.412+05	2026-08-26 23:09:50.436+05
47	1	pending_installation_assignment	normal	Юсупов Бахтиёр	+998902518721	Просили не шуметь до 10 утра	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-08-15	10100000.00	2244738.00	28	32	34	40	\N	\N	\N	\N	2026-07-01 23:09:50.44+05	2026-08-26 23:09:50.464+05
48	1	pending_installation_assignment	normal	Тураева Мохира	+998902479259	Просили не шуметь до 10 утра	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-07-07	16200000.00	10258851.00	28	30	34	40	\N	\N	\N	\N	2026-06-13 23:09:50.467+05	2026-08-26 23:09:50.489+05
49	1	installation_assigned	normal	Юлдашев Дониёр	+998901697659	Просили не шуметь до 10 утра	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-08-28	17900000.00	11371285.00	29	31	38	40	43	\N	\N	\N	2026-08-01 23:09:50.492+05	2026-08-26 23:09:50.521+05
50	8	installation_assigned	critical	Раззакова Малика	+998908351492	Просили не шуметь до 10 утра	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-09-06	7700000.00	2978663.00	26	30	38	40	42	\N	\N	\N	2026-07-30 23:09:50.522+05	2026-08-26 23:09:50.549+05
51	8	installation_assigned	critical	Абдуллаева Севара	+998905483463	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-09-11	6400000.00	4332242.00	29	30	36	40	41	\N	\N	\N	2026-08-14 23:09:50.552+05	2026-08-26 23:09:50.579+05
52	1	installation_in_progress	normal	Нурматов Шерзод	+998908359495	\N	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-08-23	19000000.00	5041071.00	26	32	35	40	43	\N	\N	\N	2026-08-07 23:09:50.581+05	2026-08-26 23:09:50.609+05
53	1	installation_in_progress	normal	Собирова Гульнара	+998903679323	Просили не шуметь до 10 утра	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-07-24	16300000.00	6736597.00	26	30	36	39	42	\N	\N	\N	2026-06-10 23:09:50.612+05	2026-08-26 23:09:50.643+05
54	8	completed	critical	Назаров Улугбек	+998906749571	\N	г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, 23, офис 5	\N	\N	2026-09-02	5000000.00	1742319.00	29	30	34	39	41	2026-08-26 23:09:50.682+05	\N	\N	2026-08-12 23:09:50.647+05	2026-08-26 23:09:50.682+05
55	8	completed	critical	Абдуллаева Севара	+998903389429	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-08-25	15300000.00	3814453.00	28	32	36	40	42	2026-08-26 23:09:50.718+05	\N	\N	2026-07-23 23:09:50.684+05	2026-08-26 23:09:50.718+05
56	8	completed	normal	Бекмуродов Фаррух	+998903971570	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-08-13	10400000.00	6732509.00	26	32	36	39	43	2026-08-26 23:09:50.755+05	\N	\N	2026-07-08 23:09:50.721+05	2026-08-26 23:09:50.755+05
57	1	completed	critical	Юлдашев Дониёр	+998908073388	\N	г. Ташкент, Мирабадский р-н, ул. Афросиаб, 12, кв. 34	\N	\N	2026-08-22	20100000.00	13459094.00	29	32	36	39	41	2026-08-26 23:09:50.791+05	\N	\N	2026-07-20 23:09:50.759+05	2026-08-26 23:09:50.791+05
58	1	completed	normal	Рахмонов Икром	+998907365326	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-07-27	7400000.00	5069570.00	26	32	34	39	41	2026-08-26 23:09:50.829+05	\N	\N	2026-06-24 23:09:50.792+05	2026-08-26 23:09:50.829+05
59	8	completed	normal	Мирзоева Феруза	+998902589669	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-08-27	18200000.00	6732855.00	28	30	33	40	43	2026-08-26 23:09:50.865+05	\N	\N	2026-07-15 23:09:50.832+05	2026-08-26 23:09:50.865+05
60	1	completed	critical	Назаров Улугбек	+998909494293	\N	г. Ургенч, ул. Ал-Хорезми, 56	\N	\N	2026-08-11	16300000.00	7630677.00	28	30	36	39	42	2026-08-26 23:09:50.9+05	\N	\N	2026-07-13 23:09:50.866+05	2026-08-26 23:09:50.9+05
61	1	completed	critical	Салимова Гулбахор	+998909723952	\N	г. Ташкент, Чиланзарский р-н, квартал 19, д. 44, кв. 91	\N	\N	2026-09-08	6200000.00	1994651.00	27	30	35	40	43	2026-08-26 23:09:50.935+05	\N	\N	2026-08-14 23:09:50.903+05	2026-08-26 23:09:50.935+05
62	8	completed	urgent	Салимова Гулбахор	+998902291021	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-07-05	14700000.00	6089446.00	27	31	33	40	43	2026-08-26 23:09:50.97+05	\N	\N	2026-06-16 23:09:50.937+05	2026-08-26 23:09:50.97+05
63	1	completed	urgent	Рахмонов Икром	+998909243646	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-07-23	3600000.00	1874911.00	27	30	35	39	41	2026-08-26 23:09:51.006+05	\N	\N	2026-06-09 23:09:50.972+05	2026-08-26 23:09:51.006+05
64	1	completed	critical	Раззакова Малика	+998905673723	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-09-27	16400000.00	5939053.00	29	31	37	39	43	2026-08-26 23:09:51.041+05	\N	\N	2026-08-21 23:09:51.008+05	2026-08-26 23:09:51.041+05
65	1	completed	normal	Собирова Гульнара	+998908408345	\N	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-08-28	20800000.00	9630901.00	28	31	36	40	42	2026-08-26 23:09:51.076+05	\N	\N	2026-08-08 23:09:51.044+05	2026-08-26 23:09:51.076+05
66	1	completed	critical	Каримова Дилором	+998907522392	\N	г. Ташкент, Сергелийский р-н, массив Спутник, д. 3, кв. 12	\N	\N	2026-07-15	10800000.00	5213544.00	29	32	35	40	41	2026-08-26 23:09:51.111+05	\N	\N	2026-06-16 23:09:51.079+05	2026-08-26 23:09:51.111+05
67	1	completed	normal	Назаров Улугбек	+998907931536	\N	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-07-08	9800000.00	3203231.00	29	30	33	39	42	2026-08-26 23:09:51.148+05	\N	\N	2026-06-07 23:09:51.113+05	2026-08-26 23:09:51.148+05
68	1	cancelled	urgent	Абдуллаева Севара	+998909485121	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-08-14	5200000.00	1455855.00	28	\N	\N	\N	\N	\N	2026-08-26 23:09:51.155+05	Клиент выбрал другого подрядчика	2026-06-30 23:09:51.15+05	2026-08-26 23:09:51.155+05
69	8	cancelled	urgent	Рахмонов Икром	+998905190183	\N	г. Ташкент, Мирзо-Улугбекский р-н, ул. Буюк Ипак Йули, 108	\N	\N	2026-08-26	9800000.00	2610580.00	26	\N	\N	\N	\N	\N	2026-08-26 23:09:51.163+05	Клиент отказался от заказа	2026-07-27 23:09:51.158+05	2026-08-26 23:09:51.163+05
70	1	cancelled	normal	Каримова Дилором	+998901433133	Просили не шуметь до 10 утра	г. Ташкент, Юнусабадский р-н, массив Юнусабад-4, д. 18, кв. 7	\N	\N	2026-08-22	12500000.00	8589740.00	26	\N	\N	\N	\N	\N	2026-08-26 23:09:51.17+05	Клиент выбрал другого подрядчика	2026-08-09 23:09:51.165+05	2026-08-26 23:09:51.17+05
\.


--
-- Data for Name: payroll_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payroll_records (id, user_id, role, period_year, period_month, scheme_snapshot, calculated_amount, kpi_percent, paid_amount, status, approved_by, approved_at, paid_at, comment, created_at, updated_at) FROM stdin;
1	1	ceo	2026	8	{"rate": null, "role": "ceo", "type": "fixed", "inputs": {"workedHours": 0, "completedOrders": 14, "completedOrdersAmount": "175000000.00"}, "schemeId": 1, "kpiTarget": null, "baseAmount": "15000000.00", "effectiveFrom": "2026-01-01", "commissionPercent": null}	15000000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.173352+05	2026-08-26 23:09:51.173352+05
2	26	seller	2026	8	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 120.87, "completedOrders": 2, "completedOrdersAmount": "17800000.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	890000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.178362+05	2026-08-26 23:09:51.178362+05
3	27	seller	2026	8	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 151.02, "completedOrders": 3, "completedOrdersAmount": "24500000.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	1225000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.1814+05	2026-08-26 23:09:51.1814+05
4	28	seller	2026	8	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 173.98, "completedOrders": 4, "completedOrdersAmount": "70600000.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	3530000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.184113+05	2026-08-26 23:09:51.184113+05
5	29	seller	2026	8	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 161.48, "completedOrders": 5, "completedOrdersAmount": "62100000.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	3105000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.186662+05	2026-08-26 23:09:51.186662+05
7	31	master	2026	8	{"rate": null, "role": "master", "type": "commission", "inputs": {"workedHours": 159.4, "completedOrders": 3, "completedOrdersAmount": "51900000.00"}, "schemeId": 4, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "3.000"}	1557000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.191774+05	2026-08-26 23:09:51.191774+05
8	32	master	2026	8	{"rate": null, "role": "master", "type": "commission", "inputs": {"workedHours": 171.75, "completedOrders": 5, "completedOrdersAmount": "64000000.00"}, "schemeId": 4, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "3.000"}	1920000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.193927+05	2026-08-26 23:09:51.193927+05
9	33	sewer	2026	8	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 169.28, "completedOrders": 3, "completedOrdersAmount": "42700000.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5924800.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.195979+05	2026-08-26 23:09:51.195979+05
10	34	sewer	2026	8	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 157.22, "completedOrders": 2, "completedOrdersAmount": "12400000.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5502700.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.198569+05	2026-08-26 23:09:51.198569+05
11	35	sewer	2026	8	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 152.85, "completedOrders": 3, "completedOrdersAmount": "20600000.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5349750.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.200937+05	2026-08-26 23:09:51.200937+05
12	36	sewer	2026	8	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 156.37, "completedOrders": 5, "completedOrdersAmount": "82900000.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5472950.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.203013+05	2026-08-26 23:09:51.203013+05
13	37	sewer	2026	8	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 183.28, "completedOrders": 1, "completedOrdersAmount": "16400000.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	6414800.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.205228+05	2026-08-26 23:09:51.205228+05
14	38	sewer	2026	8	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 162.08, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5672800.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.207315+05	2026-08-26 23:09:51.207315+05
15	39	qc	2026	8	{"rate": "30000.00", "role": "qc", "type": "hourly", "inputs": {"workedHours": 149.55, "completedOrders": 8, "completedOrdersAmount": "89000000.00"}, "schemeId": 6, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	4486500.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.20947+05	2026-08-26 23:09:51.20947+05
16	40	qc	2026	8	{"rate": "30000.00", "role": "qc", "type": "hourly", "inputs": {"workedHours": 176.85, "completedOrders": 6, "completedOrdersAmount": "86000000.00"}, "schemeId": 6, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5305500.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.211496+05	2026-08-26 23:09:51.211496+05
17	41	installer	2026	8	{"rate": null, "role": "installer", "type": "commission", "inputs": {"workedHours": 161.35, "completedOrders": 5, "completedOrdersAmount": "46900000.00"}, "schemeId": 7, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "4.000"}	1876000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.213403+05	2026-08-26 23:09:51.213403+05
18	42	installer	2026	8	{"rate": null, "role": "installer", "type": "commission", "inputs": {"workedHours": 148.62, "completedOrders": 4, "completedOrdersAmount": "62200000.00"}, "schemeId": 7, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "4.000"}	2488000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.215442+05	2026-08-26 23:09:51.215442+05
19	43	installer	2026	8	{"rate": null, "role": "installer", "type": "commission", "inputs": {"workedHours": 163.27, "completedOrders": 5, "completedOrdersAmount": "65900000.00"}, "schemeId": 7, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "4.000"}	2636000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.217446+05	2026-08-26 23:09:51.217446+05
20	44	admin	2026	8	{"rate": "2000000.00", "role": "admin", "type": "kpi", "inputs": {"workedHours": 0, "completedOrders": 14, "completedOrdersAmount": "175000000.00"}, "schemeId": 2, "kpiTarget": "30.0000", "baseAmount": "6000000.00", "effectiveFrom": "2026-01-01", "commissionPercent": null}	6933333.33	46.67	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.219812+05	2026-08-26 23:09:51.219812+05
21	45	admin	2026	8	{"rate": "2000000.00", "role": "admin", "type": "kpi", "inputs": {"workedHours": 0, "completedOrders": 14, "completedOrdersAmount": "175000000.00"}, "schemeId": 2, "kpiTarget": "30.0000", "baseAmount": "6000000.00", "effectiveFrom": "2026-01-01", "commissionPercent": null}	6933333.33	46.67	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.222194+05	2026-08-26 23:09:51.222194+05
22	1	ceo	2026	7	{"rate": null, "role": "ceo", "type": "fixed", "inputs": {"workedHours": 0, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 1, "kpiTarget": null, "baseAmount": "15000000.00", "effectiveFrom": "2026-01-01", "commissionPercent": null}	15000000.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.224777+05	2026-08-26 23:09:51.224777+05
23	26	seller	2026	7	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 138.4, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.227197+05	2026-08-26 23:09:51.227197+05
24	27	seller	2026	7	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 141.58, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.229261+05	2026-08-26 23:09:51.229261+05
25	28	seller	2026	7	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 136.25, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.231158+05	2026-08-26 23:09:51.231158+05
26	29	seller	2026	7	{"rate": null, "role": "seller", "type": "commission", "inputs": {"workedHours": 142.72, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 3, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "5.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.233373+05	2026-08-26 23:09:51.233373+05
27	30	master	2026	7	{"rate": null, "role": "master", "type": "commission", "inputs": {"workedHours": 139.28, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 4, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "3.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.235587+05	2026-08-26 23:09:51.235587+05
28	31	master	2026	7	{"rate": null, "role": "master", "type": "commission", "inputs": {"workedHours": 145.02, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 4, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "3.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.237915+05	2026-08-26 23:09:51.237915+05
29	32	master	2026	7	{"rate": null, "role": "master", "type": "commission", "inputs": {"workedHours": 131.93, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 4, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "3.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.239987+05	2026-08-26 23:09:51.239987+05
30	33	sewer	2026	7	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 149.07, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	5217450.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.241957+05	2026-08-26 23:09:51.241957+05
31	34	sewer	2026	7	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 124.55, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	4359250.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.244105+05	2026-08-26 23:09:51.244105+05
32	35	sewer	2026	7	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 132.17, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	4625950.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.245918+05	2026-08-26 23:09:51.245918+05
33	36	sewer	2026	7	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 126.02, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	4410700.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.248367+05	2026-08-26 23:09:51.248367+05
34	37	sewer	2026	7	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 106.23, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	3718050.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.25041+05	2026-08-26 23:09:51.25041+05
35	38	sewer	2026	7	{"rate": "35000.00", "role": "sewer", "type": "hourly", "inputs": {"workedHours": 126.35, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 5, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	4422250.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.252379+05	2026-08-26 23:09:51.252379+05
36	39	qc	2026	7	{"rate": "30000.00", "role": "qc", "type": "hourly", "inputs": {"workedHours": 137.42, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 6, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	4122600.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.254372+05	2026-08-26 23:09:51.254372+05
37	40	qc	2026	7	{"rate": "30000.00", "role": "qc", "type": "hourly", "inputs": {"workedHours": 122.03, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 6, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": null}	3660900.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.256238+05	2026-08-26 23:09:51.256238+05
38	41	installer	2026	7	{"rate": null, "role": "installer", "type": "commission", "inputs": {"workedHours": 125.77, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 7, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "4.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.2585+05	2026-08-26 23:09:51.2585+05
39	42	installer	2026	7	{"rate": null, "role": "installer", "type": "commission", "inputs": {"workedHours": 135.57, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 7, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "4.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.260493+05	2026-08-26 23:09:51.260493+05
40	43	installer	2026	7	{"rate": null, "role": "installer", "type": "commission", "inputs": {"workedHours": 113.95, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 7, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "4.000"}	0.00	\N	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.262817+05	2026-08-26 23:09:51.262817+05
41	44	admin	2026	7	{"rate": "2000000.00", "role": "admin", "type": "kpi", "inputs": {"workedHours": 0, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 2, "kpiTarget": "30.0000", "baseAmount": "6000000.00", "effectiveFrom": "2026-01-01", "commissionPercent": null}	6000000.00	0.00	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.264937+05	2026-08-26 23:09:51.264937+05
42	45	admin	2026	7	{"rate": "2000000.00", "role": "admin", "type": "kpi", "inputs": {"workedHours": 0, "completedOrders": 0, "completedOrdersAmount": "0.00"}, "schemeId": 2, "kpiTarget": "30.0000", "baseAmount": "6000000.00", "effectiveFrom": "2026-01-01", "commissionPercent": null}	6000000.00	0.00	0.00	draft	\N	\N	\N	\N	2026-08-26 23:09:51.267093+05	2026-08-26 23:09:51.267093+05
6	30	master	2026	8	{"rate": null, "role": "master", "type": "commission", "inputs": {"workedHours": 185.53, "completedOrders": 6, "completedOrdersAmount": "59100000.00"}, "schemeId": 4, "kpiTarget": null, "baseAmount": null, "effectiveFrom": "2026-01-01", "commissionPercent": "3.000"}	1773000.00	\N	1773000.00	paid	1	2026-08-27 00:59:49.54+05	2026-08-27 00:59:52.202+05	\N	2026-08-26 23:09:51.189002+05	2026-08-27 00:59:52.202+05
\.


--
-- Data for Name: payroll_schemes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payroll_schemes (id, role, type, base_amount, rate, kpi_target, commission_percent, is_active, effective_from, created_by, created_at, updated_at) FROM stdin;
1	ceo	fixed	15000000.00	\N	\N	\N	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
2	admin	kpi	6000000.00	2000000.00	30.0000	\N	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
3	seller	commission	\N	\N	\N	5.000	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
4	master	commission	\N	\N	\N	3.000	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
5	sewer	hourly	\N	35000.00	\N	\N	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
6	qc	hourly	\N	30000.00	\N	\N	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
7	installer	commission	\N	\N	\N	4.000	t	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
8	smm	fixed	4000000.00	\N	\N	\N	f	2026-01-01	1	2026-08-26 22:22:19.48307+05	2026-08-27 01:07:45.711+05
9	smm	fixed	4500000.00	\N	\N	\N	t	2026-01-01	1	2026-08-27 01:07:45.713748+05	2026-08-27 01:07:45.713748+05
\.


--
-- Data for Name: purchase_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_items (id, name, unit, price, category, is_active, created_by, created_at, updated_at) FROM stdin;
1	Ткань блэкаут	m	85000.00	fabric	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
2	Тюль органза	m	45000.00	fabric	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
3	Карниз профильный алюминий	m	65000.00	cornice	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
4	Лента шторная	m	12000.00	consumable	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
5	Крючки шторные	set	25000.00	consumable	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
6	Подхваты	pcs	55000.00	accessory	t	1	2026-08-26 22:22:19.48307+05	2026-08-26 22:22:19.48307+05
\.


--
-- Data for Name: purchases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchases (id, order_id, item_id, quantity, unit_price, comment, created_by, created_at) FROM stdin;
1	9	2	11.273	45000.00	\N	44	2026-08-26 23:09:49.72184+05
2	9	4	4.735	12000.00	\N	44	2026-08-26 23:09:49.722932+05
3	10	6	1.448	55000.00	\N	44	2026-08-26 23:09:49.731558+05
4	10	1	4.016	85000.00	\N	44	2026-08-26 23:09:49.732269+05
5	10	3	8.963	65000.00	\N	44	2026-08-26 23:09:49.732874+05
6	10	5	6.301	25000.00	\N	44	2026-08-26 23:09:49.733347+05
7	11	4	8.685	12000.00	\N	44	2026-08-26 23:09:49.743356+05
8	12	3	11.594	65000.00	\N	44	2026-08-26 23:09:49.7581+05
9	12	4	1.467	12000.00	\N	44	2026-08-26 23:09:49.758538+05
10	12	5	5.420	25000.00	\N	44	2026-08-26 23:09:49.75891+05
11	13	2	9.279	45000.00	\N	44	2026-08-26 23:09:49.771292+05
12	13	6	2.178	55000.00	\N	44	2026-08-26 23:09:49.771938+05
13	14	6	8.915	55000.00	\N	44	2026-08-26 23:09:49.781739+05
14	14	2	10.611	45000.00	\N	44	2026-08-26 23:09:49.782332+05
15	16	1	7.200	85000.00	\N	44	2026-08-26 23:09:49.807587+05
16	16	1	10.059	85000.00	\N	44	2026-08-26 23:09:49.808128+05
17	16	3	5.842	65000.00	\N	44	2026-08-26 23:09:49.808596+05
18	16	3	5.626	65000.00	\N	44	2026-08-26 23:09:49.809062+05
19	18	4	12.534	12000.00	\N	44	2026-08-26 23:09:49.835546+05
20	18	1	3.540	85000.00	\N	44	2026-08-26 23:09:49.836109+05
21	18	2	1.597	45000.00	\N	44	2026-08-26 23:09:49.836583+05
22	19	6	11.951	55000.00	\N	44	2026-08-26 23:09:49.85413+05
23	19	5	8.740	25000.00	\N	44	2026-08-26 23:09:49.8547+05
24	20	3	6.456	65000.00	\N	44	2026-08-26 23:09:49.870152+05
25	20	4	10.362	12000.00	\N	44	2026-08-26 23:09:49.870643+05
26	21	2	10.797	45000.00	\N	44	2026-08-26 23:09:49.886228+05
27	22	2	7.133	45000.00	\N	44	2026-08-26 23:09:49.901848+05
28	23	2	6.050	45000.00	\N	44	2026-08-26 23:09:49.917044+05
29	23	6	9.201	55000.00	\N	44	2026-08-26 23:09:49.917799+05
30	23	1	3.033	85000.00	\N	44	2026-08-26 23:09:49.918614+05
31	24	6	10.624	55000.00	\N	44	2026-08-26 23:09:49.933637+05
32	24	3	8.164	65000.00	\N	44	2026-08-26 23:09:49.934129+05
33	25	4	6.019	12000.00	\N	44	2026-08-26 23:09:49.953359+05
34	25	3	9.386	65000.00	\N	44	2026-08-26 23:09:49.95399+05
35	26	2	8.401	45000.00	\N	44	2026-08-26 23:09:49.976196+05
36	26	4	1.213	12000.00	\N	44	2026-08-26 23:09:49.976718+05
37	26	5	3.982	25000.00	\N	44	2026-08-26 23:09:49.977127+05
38	27	2	10.265	45000.00	\N	44	2026-08-26 23:09:49.997866+05
39	28	6	9.836	55000.00	\N	44	2026-08-26 23:09:50.019043+05
40	29	5	10.939	25000.00	\N	44	2026-08-26 23:09:50.038932+05
41	29	2	4.149	45000.00	\N	44	2026-08-26 23:09:50.039408+05
42	29	3	1.147	65000.00	\N	44	2026-08-26 23:09:50.039907+05
43	30	6	8.422	55000.00	\N	44	2026-08-26 23:09:50.059451+05
44	32	3	2.490	65000.00	\N	44	2026-08-26 23:09:50.103034+05
45	32	3	4.549	65000.00	\N	44	2026-08-26 23:09:50.103541+05
46	32	5	7.950	25000.00	\N	44	2026-08-26 23:09:50.104251+05
47	35	1	9.923	85000.00	\N	44	2026-08-26 23:09:50.171536+05
48	36	2	9.580	45000.00	\N	44	2026-08-26 23:09:50.204392+05
49	37	5	5.377	25000.00	\N	44	2026-08-26 23:09:50.22789+05
50	40	5	4.833	25000.00	\N	44	2026-08-26 23:09:50.291534+05
51	40	4	3.560	12000.00	\N	44	2026-08-26 23:09:50.291973+05
52	46	2	9.305	45000.00	\N	44	2026-08-26 23:09:50.438498+05
53	46	2	12.597	45000.00	\N	44	2026-08-26 23:09:50.43884+05
54	46	3	3.478	65000.00	\N	44	2026-08-26 23:09:50.43935+05
55	47	2	6.809	45000.00	\N	44	2026-08-26 23:09:50.466896+05
56	47	4	4.410	12000.00	\N	44	2026-08-26 23:09:50.467365+05
57	48	1	12.971	85000.00	\N	44	2026-08-26 23:09:50.491385+05
58	48	6	8.752	55000.00	\N	44	2026-08-26 23:09:50.491728+05
59	48	5	7.165	25000.00	\N	44	2026-08-26 23:09:50.492044+05
60	50	1	6.505	85000.00	\N	44	2026-08-26 23:09:50.551842+05
61	50	3	1.929	65000.00	\N	44	2026-08-26 23:09:50.552198+05
62	50	5	5.987	25000.00	\N	44	2026-08-26 23:09:50.552514+05
63	51	6	4.920	55000.00	\N	44	2026-08-26 23:09:50.581028+05
64	51	6	4.583	55000.00	\N	44	2026-08-26 23:09:50.581362+05
65	52	2	6.656	45000.00	\N	44	2026-08-26 23:09:50.611424+05
66	52	3	12.489	65000.00	\N	44	2026-08-26 23:09:50.611836+05
67	52	6	10.278	55000.00	\N	44	2026-08-26 23:09:50.61216+05
68	52	6	9.588	55000.00	\N	44	2026-08-26 23:09:50.612466+05
69	53	6	3.321	55000.00	\N	44	2026-08-26 23:09:50.645519+05
70	53	2	5.611	45000.00	\N	44	2026-08-26 23:09:50.645904+05
71	53	2	6.347	45000.00	\N	44	2026-08-26 23:09:50.646389+05
72	53	1	4.329	85000.00	\N	44	2026-08-26 23:09:50.646841+05
73	55	3	12.589	65000.00	\N	44	2026-08-26 23:09:50.720157+05
74	55	3	3.158	65000.00	\N	44	2026-08-26 23:09:50.720568+05
75	55	6	9.488	55000.00	\N	44	2026-08-26 23:09:50.7209+05
76	55	4	10.201	12000.00	\N	44	2026-08-26 23:09:50.721215+05
77	56	4	3.899	12000.00	\N	44	2026-08-26 23:09:50.757885+05
78	56	6	7.759	55000.00	\N	44	2026-08-26 23:09:50.759411+05
79	58	2	11.074	45000.00	\N	44	2026-08-26 23:09:50.831262+05
80	58	2	7.530	45000.00	\N	44	2026-08-26 23:09:50.831598+05
81	60	4	12.436	12000.00	\N	44	2026-08-26 23:09:50.902718+05
82	60	5	9.466	25000.00	\N	44	2026-08-26 23:09:50.903057+05
83	60	3	3.933	65000.00	\N	44	2026-08-26 23:09:50.903365+05
84	61	1	2.272	85000.00	\N	44	2026-08-26 23:09:50.937548+05
85	64	3	10.962	65000.00	\N	44	2026-08-26 23:09:51.043466+05
86	64	3	7.614	65000.00	\N	44	2026-08-26 23:09:51.043926+05
87	64	6	10.677	55000.00	\N	44	2026-08-26 23:09:51.044287+05
88	64	3	9.705	65000.00	\N	44	2026-08-26 23:09:51.044606+05
89	65	3	2.766	65000.00	\N	44	2026-08-26 23:09:51.078514+05
90	65	1	5.132	85000.00	\N	44	2026-08-26 23:09:51.079023+05
91	66	6	9.311	55000.00	\N	44	2026-08-26 23:09:51.113027+05
92	67	1	12.195	85000.00	\N	44	2026-08-26 23:09:51.149746+05
93	68	5	4.021	25000.00	\N	44	2026-08-26 23:09:51.157293+05
94	68	3	6.492	65000.00	\N	44	2026-08-26 23:09:51.15777+05
95	68	6	5.683	55000.00	\N	44	2026-08-26 23:09:51.158252+05
96	68	6	11.585	55000.00	\N	44	2026-08-26 23:09:51.158638+05
97	70	2	3.080	45000.00	\N	44	2026-08-26 23:09:51.17172+05
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, user_agent, expires_at, revoked_at, created_at) FROM stdin;
1	1	712fb5dfc131d2be397a4620fe4e5473b142b74648d29e1e7bffbd541b7b3a98	Mozilla/5.0 (Windows NT; Windows NT 10.0; ru-RU) WindowsPowerShell/5.1.26100.9168	2026-09-25 22:28:09.159+05	2026-08-26 22:28:09.469+05	2026-08-26 22:28:09.160289+05
27	45	29f72c7f0a6c6c18dc890e14e59ac9d29beba92b80c6956ded454d78f59ef3d8	node	2026-09-26 02:51:41.748+05	2026-08-27 02:51:41.892+05	2026-08-27 02:51:41.748806+05
4	1	b27cba9230d297123c2dc849576ad210d1482bdb3f375c511169f48139e6afbd	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-09-25 22:37:01.085+05	2026-08-26 22:52:02.74+05	2026-08-26 22:37:01.087124+05
8	1	2af74f11aabbe8695e9abc2588eb6515592316acb2545e9d9e230f09e624079c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-09-25 22:52:02.741+05	2026-08-26 23:18:40.044+05	2026-08-26 22:52:02.738389+05
11	1	7268db3c16e1c8605fc017ed9abc81767cdc8f8936e8f5ed8dfd73383210517b	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-09-25 23:18:40.044+05	2026-08-26 23:35:14.178+05	2026-08-26 23:18:40.043139+05
12	1	f548bf4d772b813c8cc2282010aed0279af3e98c2114aea3b85a60818d43ab22	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-09-25 23:35:14.179+05	2026-08-27 00:52:28.683+05	2026-08-26 23:35:14.178155+05
13	1	defab986a5c4d7a35245ef5f7d3db4e73b2984eb76656e29f5b975bbedbed3e5	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-09-26 00:52:28.686+05	2026-08-27 02:40:47.578+05	2026-08-27 00:52:28.67737+05
21	46	a60b2c8e3378d29ab9227bbb28e6ac11d34922e7334f1aaf5ac3634a2495ed25	node	2026-09-26 02:51:23.294+05	2026-08-27 02:51:23.402+05	2026-08-27 02:51:23.294871+05
28	45	10c092e858873ac8e6a106df8fe114b5ec4202b9e2748ffc05aa58a9140a0647	node	2026-09-26 02:51:41.85+05	2026-08-27 02:51:41.914+05	2026-08-27 02:51:41.851208+05
23	46	5a90257bc316261f862763596a9d6aaab2dcc7964f3f2a2f4341db11124fac69	node	2026-09-26 02:51:23.403+05	2026-08-27 02:51:23.445+05	2026-08-27 02:51:23.401144+05
22	46	3bbf8852f889b1192af2e72557ad4b1c652b356e2148dfc91a042caf8bf34a5d	node	2026-09-26 02:51:23.393+05	2026-08-27 02:51:23.46+05	2026-08-27 02:51:23.394129+05
26	45	5561a2b627d5a2ba00c4a9f8554539164b730d55c186c1bcae9d1f0425bd6995	node	2026-09-26 02:51:41.652+05	2026-08-27 02:51:41.865+05	2026-08-27 02:51:41.653215+05
29	45	a871446bffb1a2803bb160e26368cba103342357cf90e22b9c327a0c4cb3e453	node	2026-09-26 02:51:41.866+05	2026-08-27 02:51:41.921+05	2026-08-27 02:51:41.863625+05
24	46	ebbf2c5a8ad77714dc0cdc811b34cbbf471a26b2907fd673951d795d4f652ae1	node	2026-09-26 02:51:23.445+05	2026-08-27 03:05:59.623+05	2026-08-27 02:51:23.443863+05
25	46	cad59adc2adc9ac2981a2566d8e52a822a807d89686a3cd55ef224c40ef3deb8	node	2026-09-26 02:51:23.461+05	2026-08-27 03:05:59.623+05	2026-08-27 02:51:23.458558+05
46	46	cff3aaa40ddb0e0efbb8e54a3620779f4a9c90c6f71ea8375b777982ee83431a	node	2026-09-26 03:05:59.613+05	2026-08-27 03:05:59.623+05	2026-08-27 03:05:59.615898+05
30	45	c61cf5e7376d9351e2b2578efb514ef9e33383160f6f9eced8c8d7d3cfe3b21d	node	2026-09-26 02:51:41.892+05	2026-08-27 03:05:59.715+05	2026-08-27 02:51:41.891405+05
31	45	31ea99622c5f87675b2a33d9c758b6af0b7518721112507cca39c4275ec8fe9b	node	2026-09-26 02:51:41.915+05	2026-08-27 03:05:59.715+05	2026-08-27 02:51:41.912558+05
32	45	1d83cdcc91c10c5206aac879b47e9c09763c98a2aed1b74601f878abfa212803	node	2026-09-26 02:51:41.922+05	2026-08-27 03:05:59.715+05	2026-08-27 02:51:41.920834+05
47	45	a56c3a41d01b4604af6ffd047f545bbc6151eb68d116b2f2ce97039bf6694112	node	2026-09-26 03:05:59.706+05	2026-08-27 03:05:59.715+05	2026-08-27 03:05:59.708489+05
34	33	d18a59edd759c127027cdc805792f1a64269e8bfa92035f88d3ba710a6e4f96c	node	2026-09-26 02:52:33.114+05	2026-08-27 03:05:59.827+05	2026-08-27 02:52:33.11614+05
37	33	fee68450f3519a67178ccc55102a239799287d378c34ca070ff5a71ddde89e1e	node	2026-09-26 02:53:15.692+05	2026-08-27 03:05:59.827+05	2026-08-27 02:53:15.693496+05
39	33	af3c26cbd1e381eee8c34875bc6b49bbb9851e90fedd9a10ff963322fd4f94c4	node	2026-09-26 02:53:49.821+05	2026-08-27 03:05:59.827+05	2026-08-27 02:53:49.822247+05
42	33	e1218b94eb0b2f810d098192be92a6eef52cf9d8620a65145d7a182e8ce4f603	node	2026-09-26 02:54:17.943+05	2026-08-27 03:05:59.827+05	2026-08-27 02:54:17.944532+05
48	33	90b590b0d3535908ed164577f027fee9154bbf3cae40e723b8d8dbd5a3d76427	node	2026-09-26 03:05:59.814+05	2026-08-27 03:05:59.827+05	2026-08-27 03:05:59.81687+05
35	41	de2e45a3744fbfc146274a32e2a2ed56b4302a641865b58d735b1bd524d27dae	node	2026-09-26 02:52:33.2+05	2026-08-27 03:05:59.92+05	2026-08-27 02:52:33.201552+05
38	41	fab021f1826e5d69cb16e367d98e761ee96aedbb5efd0b7cf212bc63307db9c4	node	2026-09-26 02:53:15.791+05	2026-08-27 03:05:59.92+05	2026-08-27 02:53:15.792585+05
49	41	a1790a156cf5e0cc9d54bf5ead16363f9779d2b5632af6dddccb90f938147739	node	2026-09-26 03:05:59.914+05	2026-08-27 03:05:59.92+05	2026-08-27 03:05:59.91643+05
2	1	43f3ea79a243b02c1254bbc6c775025c0afaadadfb9c4afceda30100ce40dcf2	Mozilla/5.0 (Windows NT; Windows NT 10.0; ru-RU) WindowsPowerShell/5.1.26100.9168	2026-09-25 22:28:09.47+05	2026-08-27 03:05:59.938+05	2026-08-26 22:28:09.466764+05
3	1	36604edcec7a7a7c8af993639680a5bf7b1fb49fb568781a0e06c85234c53f81	curl/8.21.0	2026-09-25 22:36:47.368+05	2026-08-27 03:05:59.938+05	2026-08-26 22:36:47.370652+05
5	1	21610d9a90023366374281e28beddbffa8e6096e7dec54835015a8c5bc6a3e99	curl/8.21.0	2026-09-25 22:37:57.138+05	2026-08-27 03:05:59.938+05	2026-08-26 22:37:57.139395+05
6	1	835d3b60c034d41907e91a65b09c643ed6e205d404dd55c6170fe2fdf0c324ea	curl/8.21.0	2026-09-25 22:39:00.444+05	2026-08-27 03:05:59.938+05	2026-08-26 22:39:00.445794+05
7	1	f9a711a15176fa124535bc6c8968848814f3818fb149d08399c325bce080cd53	curl/8.21.0	2026-09-25 22:48:54.71+05	2026-08-27 03:05:59.938+05	2026-08-26 22:48:54.71197+05
9	1	b89c6b10c690eac82d6b287a82d6a227c73e44c4333c5329f40d0ed316c945a5	node	2026-09-25 22:55:13.527+05	2026-08-27 03:05:59.938+05	2026-08-26 22:55:13.535706+05
10	1	c8aaf7e3255174f5084efeef42f5fd42de75eb1a8cf04d3ff4798348c694321b	curl/8.21.0	2026-09-25 23:18:37.746+05	2026-08-27 03:05:59.938+05	2026-08-26 23:18:37.747488+05
14	1	da72fe366f0fda24f8e6997f5c8ab71bc2e0c9899575c0a7aee4a9589d8a80f4	node	2026-09-26 01:07:44.888+05	2026-08-27 03:05:59.938+05	2026-08-27 01:07:44.8908+05
16	1	3c3c7a35a39686c7e0293a4c421b1f1f6e352599fbe1f2d842cfe5c5cb8eb4db	node	2026-09-26 01:09:16.739+05	2026-08-27 03:05:59.938+05	2026-08-27 01:09:16.741122+05
17	1	cc8b8a4339b6f97f987c2c48d6ce54d6c668a559a9af48399f39ceb40a75e4bf	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	2026-09-26 02:40:47.581+05	2026-08-27 03:05:59.938+05	2026-08-27 02:40:47.570715+05
18	1	7fd230ff7e0b8c06c68774a7d26fc966d67777c7f7476039a9c7d80e93e1b6a3	node	2026-09-26 02:49:49.781+05	2026-08-27 03:05:59.938+05	2026-08-27 02:49:49.782422+05
19	1	efec077bf5668f4dedfe0f2ef69c16b3947d97459dd483519f346c9912aabc6b	node	2026-09-26 02:50:13.086+05	2026-08-27 03:05:59.938+05	2026-08-27 02:50:13.087258+05
20	1	264dcbebd3e793d35d621f3197ce073a418dee098b16e63784917134eb6621c9	node	2026-09-26 02:50:43.879+05	2026-08-27 03:05:59.938+05	2026-08-27 02:50:43.880273+05
33	1	a49d47e01a43a75e459c61ae93f232c3e23fed94f33a654c147f0de701c2a2db	node	2026-09-26 02:52:33.014+05	2026-08-27 03:05:59.938+05	2026-08-27 02:52:33.015679+05
36	1	97ebe56bec6841529b29ac409ee44cb646835ff04c154a3334419b3b436c413e	node	2026-09-26 02:53:15.588+05	2026-08-27 03:05:59.938+05	2026-08-27 02:53:15.590029+05
40	1	83540aaaf0927e17f028193bd6a2874913611fb3e16d4ff2c310c90bc4a129e2	node	2026-09-26 02:53:49.983+05	2026-08-27 03:05:59.938+05	2026-08-27 02:53:49.98427+05
41	1	5890a0b359da233b1cb0df168ce48ca7ec0acaa19ec3e50ca91edb88bbf9920b	node	2026-09-26 02:54:17.84+05	2026-08-27 03:05:59.938+05	2026-08-27 02:54:17.841068+05
43	1	aff81c3695394da05a18645c1ed6b9ee20a84d89e1299a4e0579b1c904bd6abc	node	2026-09-26 03:03:45.974+05	2026-08-27 03:05:59.938+05	2026-08-27 03:03:45.977343+05
44	1	af09136bde232359143e0914a382c898711265ca181bed786a4f0b9ea88ec087	node	2026-09-26 03:05:15.42+05	2026-08-27 03:05:59.938+05	2026-08-27 03:05:15.422668+05
45	1	3a91c3926396e47065073deddb5a9bcf5450125f104051f55460494ea2de157b	node	2026-09-26 03:05:59.485+05	2026-08-27 03:05:59.938+05	2026-08-27 03:05:59.487384+05
50	45	7ddccde2158dba0a38099cc04b7a9c7d410e4d1f92862a048fc56b298cc04a56	node	2026-09-26 03:16:23.728+05	2026-08-27 03:16:23.975+05	2026-08-27 03:16:23.729427+05
51	45	52eec8292e341e50db02a9a58e9e1c83df5c0a66cc5fe0dc8ac371958587939b	node	2026-09-26 03:16:23.849+05	2026-08-27 03:16:23.986+05	2026-08-27 03:16:23.849819+05
52	45	f206e2031fedebe2c0afbf257e715dba380b98ac13bc7a5443b39f6735ca0a37	node	2026-09-26 03:16:23.959+05	2026-08-27 03:16:23.986+05	2026-08-27 03:16:23.960573+05
53	45	21d0ac68263f572732f6d0d540bd4f5f344802bec8df078abd37a8499a32152c	node	2026-09-26 03:16:23.975+05	2026-08-27 03:16:23.986+05	2026-08-27 03:16:23.970576+05
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shifts (id, user_id, branch_id, started_at, ended_at, start_latitude, start_longitude, start_distance_meters, end_latitude, end_longitude, end_distance_meters, is_manually_adjusted, adjusted_by, adjusted_at, adjustment_reason, created_at, updated_at) FROM stdin;
7	33	1	2026-07-13 08:25:00+05	2026-07-13 17:04:00+05	41.29940504132845	69.23983045812882	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
8	34	1	2026-07-13 08:15:00+05	2026-07-13 17:23:00+05	41.29926642465536	69.24042411654517	51	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
9	35	1	2026-07-13 08:21:00+05	2026-07-13 15:14:00+05	41.299660216587036	69.24014966881684	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
10	37	1	2026-07-13 08:07:00+05	2026-07-13 16:09:00+05	41.29934764816333	69.24045243242568	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
11	38	1	2026-07-13 08:08:00+05	2026-07-13 15:43:00+05	41.29919361701757	69.24025786609482	60	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
12	30	1	2026-07-13 08:20:00+05	2026-07-13 17:51:00+05	41.29926877680719	69.23994944977927	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
13	31	1	2026-07-13 08:05:00+05	2026-07-13 15:04:00+05	41.299272196527944	69.2402244898973	37	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
14	32	1	2026-07-13 08:07:00+05	2026-07-13 17:54:00+05	41.29920957985483	69.24032017172985	37	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
15	39	1	2026-07-13 08:17:00+05	2026-07-13 16:01:00+05	41.29955406964496	69.24015683988314	81	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
16	40	1	2026-07-13 08:05:00+05	2026-07-13 17:51:00+05	41.2998227601856	69.24011489465944	47	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
17	41	1	2026-07-13 08:14:00+05	2026-07-13 18:29:00+05	41.299302347426675	69.23970561483297	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
18	42	1	2026-07-13 08:25:00+05	2026-07-13 15:34:00+05	41.29985292293895	69.23980597715229	37	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
19	43	1	2026-07-13 08:06:00+05	2026-07-13 18:01:00+05	41.29923789006677	69.24035900503509	85	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
20	26	1	2026-07-13 08:15:00+05	2026-07-13 17:21:00+05	41.299787015758646	69.23987201409824	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
21	27	1	2026-07-13 08:24:00+05	2026-07-13 18:39:00+05	41.29929520518072	69.24032765323017	64	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
22	29	1	2026-07-13 08:23:00+05	2026-07-13 16:30:00+05	41.29921101169642	69.24010654284581	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
23	33	1	2026-07-14 08:14:00+05	2026-07-14 16:52:00+05	41.299373963255434	69.24029284010194	33	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
24	34	1	2026-07-14 08:00:00+05	2026-07-14 17:51:00+05	41.29927015992291	69.24004126313888	55	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
25	36	1	2026-07-14 08:04:00+05	2026-07-14 17:55:00+05	41.2993209600851	69.23982940058801	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
26	37	1	2026-07-14 08:15:00+05	2026-07-14 18:07:00+05	41.299101540730334	69.24014181646649	51	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
27	38	1	2026-07-14 08:04:00+05	2026-07-14 15:13:00+05	41.299805942931215	69.23988322954085	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
28	31	1	2026-07-14 08:12:00+05	2026-07-14 15:29:00+05	41.299880309721644	69.24038526042327	64	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
29	32	1	2026-07-14 08:11:00+05	2026-07-14 16:27:00+05	41.299159030627465	69.23978379237577	61	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
30	39	1	2026-07-14 08:01:00+05	2026-07-14 18:12:00+05	41.29967892096173	69.2404297976898	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
31	40	1	2026-07-14 08:00:00+05	2026-07-14 18:10:00+05	41.29912940386571	69.24026661646906	75	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
32	41	1	2026-07-14 08:19:00+05	2026-07-14 15:24:00+05	41.29919796482809	69.2397841687208	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
33	42	1	2026-07-14 08:08:00+05	2026-07-14 18:21:00+05	41.299407627525184	69.23977511679661	79	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
34	43	1	2026-07-14 08:09:00+05	2026-07-14 16:14:00+05	41.29982663469371	69.24029829287008	89	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
35	26	1	2026-07-14 08:00:00+05	2026-07-14 17:28:00+05	41.2991852162227	69.2401746803116	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
36	27	1	2026-07-14 08:07:00+05	2026-07-14 15:26:00+05	41.29929660024327	69.24014009741526	29	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
37	28	1	2026-07-14 08:11:00+05	2026-07-14 17:47:00+05	41.29983040081598	69.24009040565956	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
38	29	1	2026-07-14 08:15:00+05	2026-07-14 15:11:00+05	41.299220769693704	69.24030052440986	85	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
39	33	1	2026-07-15 08:01:00+05	2026-07-15 15:26:00+05	41.29966042253226	69.23990007050875	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
40	34	1	2026-07-15 08:02:00+05	2026-07-15 18:38:00+05	41.29978268195764	69.23988665308914	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
41	35	1	2026-07-15 08:12:00+05	2026-07-15 17:53:00+05	41.299241477064605	69.23987002223339	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
42	36	1	2026-07-15 08:18:00+05	2026-07-15 17:25:00+05	41.299200337766855	69.2402317753721	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
43	37	1	2026-07-15 08:06:00+05	2026-07-15 18:01:00+05	41.29960301035047	69.24003844670224	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
44	38	1	2026-07-15 08:25:00+05	2026-07-15 15:36:00+05	41.2994487387171	69.24013533705734	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
45	30	1	2026-07-15 08:10:00+05	2026-07-15 15:04:00+05	41.299713445690834	69.2404299475424	7	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
46	31	1	2026-07-15 08:25:00+05	2026-07-15 18:37:00+05	41.29985899224691	69.24025854734481	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
47	39	1	2026-07-15 08:23:00+05	2026-07-15 15:31:00+05	41.29941387663055	69.23983374326788	53	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
48	40	1	2026-07-15 08:06:00+05	2026-07-15 17:15:00+05	41.299224095888626	69.2398875853965	33	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
49	41	1	2026-07-15 08:20:00+05	2026-07-15 17:17:00+05	41.299772440944615	69.24012143926471	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
50	42	1	2026-07-15 08:00:00+05	2026-07-15 17:26:00+05	41.29949045503773	69.24030895551554	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
51	26	1	2026-07-15 08:07:00+05	2026-07-15 18:08:00+05	41.299868688917165	69.24009719686937	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
52	27	1	2026-07-15 08:24:00+05	2026-07-15 17:02:00+05	41.299716753956304	69.24019925163834	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
53	28	1	2026-07-15 08:22:00+05	2026-07-15 15:25:00+05	41.299301157332955	69.24044554195869	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
54	29	1	2026-07-15 08:23:00+05	2026-07-15 15:47:00+05	41.29983928235248	69.24004522568099	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
55	33	1	2026-07-16 08:15:00+05	2026-07-16 16:29:00+05	41.29930998177398	69.23999953489937	89	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
56	34	1	2026-07-16 08:05:00+05	2026-07-16 15:43:00+05	41.29976475961078	69.23973393113204	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
57	35	1	2026-07-16 08:25:00+05	2026-07-16 17:36:00+05	41.29978880775571	69.24007323921509	74	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
58	36	1	2026-07-16 08:14:00+05	2026-07-16 16:38:00+05	41.29928228991684	69.24034870906603	88	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
59	38	1	2026-07-16 08:07:00+05	2026-07-16 15:01:00+05	41.29953913272303	69.23999390102419	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
60	30	1	2026-07-16 08:15:00+05	2026-07-16 16:48:00+05	41.299738467195816	69.24043989377058	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
61	31	1	2026-07-16 08:16:00+05	2026-07-16 15:39:00+05	41.29956748037655	69.23971756124571	76	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
62	32	1	2026-07-16 08:04:00+05	2026-07-16 16:51:00+05	41.29924308819715	69.24029789475388	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
63	39	1	2026-07-16 08:04:00+05	2026-07-16 18:42:00+05	41.29988137771785	69.23986132005379	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
64	41	1	2026-07-16 08:08:00+05	2026-07-16 17:21:00+05	41.29934470736831	69.24007491968219	87	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
65	42	1	2026-07-16 08:14:00+05	2026-07-16 17:15:00+05	41.29931056986246	69.2402713300461	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
66	43	1	2026-07-16 08:18:00+05	2026-07-16 18:47:00+05	41.2996117152106	69.24001854631453	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
67	26	1	2026-07-16 08:09:00+05	2026-07-16 18:19:00+05	41.29971231493242	69.240206705858	72	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
68	27	1	2026-07-16 08:18:00+05	2026-07-16 16:54:00+05	41.29962669153176	69.24026520256196	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
69	28	1	2026-07-16 08:17:00+05	2026-07-16 16:20:00+05	41.29969007124323	69.24042112445328	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
70	29	1	2026-07-16 08:06:00+05	2026-07-16 15:37:00+05	41.29962562717609	69.24045378360263	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
71	33	1	2026-07-17 08:20:00+05	2026-07-17 18:33:00+05	41.29934740156308	69.2403005000798	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
72	34	1	2026-07-17 08:04:00+05	2026-07-17 17:35:00+05	41.29910038230829	69.24007619585264	17	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
73	35	1	2026-07-17 08:22:00+05	2026-07-17 15:07:00+05	41.29952361497116	69.23978676718082	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
74	36	1	2026-07-17 08:07:00+05	2026-07-17 18:46:00+05	41.299515386988595	69.24023091566954	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
75	37	1	2026-07-17 08:18:00+05	2026-07-17 18:55:00+05	41.299132510084846	69.24039071887788	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
76	38	1	2026-07-17 08:15:00+05	2026-07-17 17:28:00+05	41.299337736463734	69.23997607247252	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
77	30	1	2026-07-17 08:21:00+05	2026-07-17 17:31:00+05	41.29936260290295	69.24028990129474	58	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
78	31	1	2026-07-17 08:16:00+05	2026-07-17 15:49:00+05	41.29913150629495	69.24031727393213	13	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
79	32	1	2026-07-17 08:02:00+05	2026-07-17 18:12:00+05	41.29921418926716	69.24049757421687	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
80	39	1	2026-07-17 08:02:00+05	2026-07-17 15:14:00+05	41.29930180972591	69.23973857808747	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
81	41	1	2026-07-17 08:01:00+05	2026-07-17 18:03:00+05	41.29973191000317	69.2402846250793	35	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
82	42	1	2026-07-17 08:16:00+05	2026-07-17 15:07:00+05	41.299884036931026	69.23979305202178	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
83	43	1	2026-07-17 08:06:00+05	2026-07-17 17:45:00+05	41.29967618586365	69.24008773108106	47	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
84	26	1	2026-07-17 08:18:00+05	2026-07-17 18:43:00+05	41.29927795605436	69.23978126423917	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
85	27	1	2026-07-17 08:11:00+05	2026-07-17 15:42:00+05	41.299582002287735	69.24028283211626	75	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
86	28	1	2026-07-17 08:18:00+05	2026-07-17 18:13:00+05	41.29984309664891	69.23970772251523	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
87	29	1	2026-07-17 08:25:00+05	2026-07-17 18:26:00+05	41.299499881921335	69.2402079765791	81	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
88	33	1	2026-07-18 08:02:00+05	2026-07-18 16:15:00+05	41.29968856716194	69.24045780097507	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
89	34	1	2026-07-18 08:09:00+05	2026-07-18 17:20:00+05	41.299278319128604	69.24034656780641	29	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
90	35	1	2026-07-18 08:05:00+05	2026-07-18 18:16:00+05	41.299762091489136	69.23972874473539	52	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
91	37	1	2026-07-18 08:25:00+05	2026-07-18 15:42:00+05	41.299324359513264	69.24048613307923	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
92	30	1	2026-07-18 08:25:00+05	2026-07-18 15:09:00+05	41.29932575858943	69.2399358728459	84	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
93	31	1	2026-07-18 08:18:00+05	2026-07-18 16:23:00+05	41.29962701195478	69.24031445012744	95	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
94	32	1	2026-07-18 08:03:00+05	2026-07-18 18:48:00+05	41.299253184217775	69.23996621765588	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
95	39	1	2026-07-18 08:06:00+05	2026-07-18 17:49:00+05	41.299625206617456	69.24010624147523	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
96	40	1	2026-07-18 08:12:00+05	2026-07-18 15:47:00+05	41.299242951520164	69.24043702294584	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
97	41	1	2026-07-18 08:21:00+05	2026-07-18 15:00:00+05	41.29987030608338	69.23976958066802	35	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
98	26	1	2026-07-18 08:11:00+05	2026-07-18 16:39:00+05	41.29974885460306	69.24048339443077	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
99	27	1	2026-07-18 08:16:00+05	2026-07-18 17:13:00+05	41.29915595817194	69.24010032305867	82	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
100	28	1	2026-07-18 08:04:00+05	2026-07-18 16:00:00+05	41.29932234507278	69.2401522360962	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
101	29	1	2026-07-18 08:15:00+05	2026-07-18 17:43:00+05	41.2993578406794	69.23977564030103	14	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
102	33	1	2026-07-20 08:08:00+05	2026-07-20 15:51:00+05	41.29952442435771	69.24037392663955	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
103	35	1	2026-07-20 08:08:00+05	2026-07-20 18:15:00+05	41.29985774682108	69.24049134816397	75	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
104	37	1	2026-07-20 08:02:00+05	2026-07-20 17:01:00+05	41.29969897179939	69.24003570053279	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
105	38	1	2026-07-20 08:23:00+05	2026-07-20 17:05:00+05	41.29969625107497	69.23971751385368	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
106	30	1	2026-07-20 08:16:00+05	2026-07-20 16:40:00+05	41.29953249583282	69.2402227474017	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
107	31	1	2026-07-20 08:04:00+05	2026-07-20 17:09:00+05	41.29977183689084	69.24019088953342	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
108	32	1	2026-07-20 08:23:00+05	2026-07-20 15:11:00+05	41.29949936977476	69.24026557556074	40	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
109	39	1	2026-07-20 08:24:00+05	2026-07-20 17:43:00+05	41.29940311869737	69.23987851998992	84	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
110	40	1	2026-07-20 08:03:00+05	2026-07-20 17:48:00+05	41.29924699746091	69.23970195178501	20	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
111	41	1	2026-07-20 08:06:00+05	2026-07-20 18:16:00+05	41.29987238572631	69.2397254742885	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
112	42	1	2026-07-20 08:18:00+05	2026-07-20 16:17:00+05	41.29978382073138	69.2398033216592	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
113	43	1	2026-07-20 08:21:00+05	2026-07-20 17:01:00+05	41.29957906308565	69.24044021933526	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
114	26	1	2026-07-20 08:16:00+05	2026-07-20 16:41:00+05	41.2994389417503	69.24020343709086	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
115	27	1	2026-07-20 08:16:00+05	2026-07-20 18:22:00+05	41.29934928028174	69.23972346648014	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
116	28	1	2026-07-20 08:25:00+05	2026-07-20 18:41:00+05	41.29989068269022	69.24025210706759	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
117	29	1	2026-07-20 08:00:00+05	2026-07-20 15:50:00+05	41.29915921008978	69.23991119733006	7	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
118	33	1	2026-07-21 08:04:00+05	2026-07-21 18:23:00+05	41.29915233015213	69.23985227308069	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
119	34	1	2026-07-21 08:08:00+05	2026-07-21 18:29:00+05	41.2996675404815	69.23998990771025	30	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
120	35	1	2026-07-21 08:10:00+05	2026-07-21 16:14:00+05	41.299698816801985	69.23972244882937	11	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
121	36	1	2026-07-21 08:02:00+05	2026-07-21 15:20:00+05	41.2991976395119	69.24011939124334	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
122	38	1	2026-07-21 08:17:00+05	2026-07-21 18:54:00+05	41.29963602878992	69.24026815450601	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
123	30	1	2026-07-21 08:25:00+05	2026-07-21 16:01:00+05	41.29951326690782	69.24011302174087	35	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
124	31	1	2026-07-21 08:00:00+05	2026-07-21 18:26:00+05	41.29934008173775	69.23994285023176	52	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
125	32	1	2026-07-21 08:13:00+05	2026-07-21 16:25:00+05	41.29925121131893	69.23974653129372	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
126	39	1	2026-07-21 08:24:00+05	2026-07-21 18:26:00+05	41.29919062952567	69.23983280873094	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
127	40	1	2026-07-21 08:00:00+05	2026-07-21 15:06:00+05	41.2996970261924	69.23981352754254	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
128	42	1	2026-07-21 08:11:00+05	2026-07-21 17:10:00+05	41.299100536688236	69.24009799918831	11	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
129	43	1	2026-07-21 08:23:00+05	2026-07-21 15:48:00+05	41.29923563428652	69.24036985699144	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
130	26	1	2026-07-21 08:22:00+05	2026-07-21 17:01:00+05	41.29918302925788	69.24018757194801	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
131	27	1	2026-07-21 08:17:00+05	2026-07-21 16:20:00+05	41.29922584308889	69.24042034239973	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
132	28	1	2026-07-21 08:18:00+05	2026-07-21 18:41:00+05	41.29974759996049	69.24008454433958	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
133	29	1	2026-07-21 08:08:00+05	2026-07-21 16:48:00+05	41.299685746672935	69.24031218960546	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
134	33	1	2026-07-22 08:01:00+05	2026-07-22 16:00:00+05	41.29918140054103	69.24027453284171	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
135	34	1	2026-07-22 08:14:00+05	2026-07-22 16:07:00+05	41.299798454748284	69.23999606625978	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
136	35	1	2026-07-22 08:21:00+05	2026-07-22 15:47:00+05	41.29987863872797	69.23971905410625	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
137	36	1	2026-07-22 08:12:00+05	2026-07-22 17:27:00+05	41.29963352963142	69.2400267678829	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
138	37	1	2026-07-22 08:12:00+05	2026-07-22 15:16:00+05	41.29941346265376	69.2402720353352	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
139	38	1	2026-07-22 08:15:00+05	2026-07-22 18:08:00+05	41.29940866096579	69.24049180757272	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
140	30	1	2026-07-22 08:13:00+05	2026-07-22 16:54:00+05	41.29957453168631	69.23979886204954	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
141	31	1	2026-07-22 08:10:00+05	2026-07-22 18:35:00+05	41.29919839792587	69.24026816221215	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
142	39	1	2026-07-22 08:16:00+05	2026-07-22 15:40:00+05	41.29971309921947	69.23989400009066	54	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
143	40	1	2026-07-22 08:02:00+05	2026-07-22 15:37:00+05	41.29974725368824	69.23990757558514	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
144	41	1	2026-07-22 08:16:00+05	2026-07-22 15:48:00+05	41.29949834440891	69.23976633184944	82	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
145	42	1	2026-07-22 08:06:00+05	2026-07-22 15:33:00+05	41.29966015159097	69.2404525196949	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
146	43	1	2026-07-22 08:04:00+05	2026-07-22 18:30:00+05	41.29940488125142	69.24046804648768	33	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
147	27	1	2026-07-22 08:24:00+05	2026-07-22 17:50:00+05	41.29956390845068	69.24008454173338	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
148	28	1	2026-07-22 08:02:00+05	2026-07-22 16:18:00+05	41.29967852455471	69.24005812952835	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
149	29	1	2026-07-22 08:04:00+05	2026-07-22 15:14:00+05	41.299198537230495	69.24005207119845	75	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
150	33	1	2026-07-23 08:08:00+05	2026-07-23 18:42:00+05	41.299537300682445	69.24031444503348	66	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
151	35	1	2026-07-23 08:11:00+05	2026-07-23 17:00:00+05	41.29912114393916	69.240124421704	87	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
152	36	1	2026-07-23 08:24:00+05	2026-07-23 17:23:00+05	41.299666119696944	69.24004826398772	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
153	38	1	2026-07-23 08:25:00+05	2026-07-23 17:42:00+05	41.29941339014173	69.23974432032779	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
154	30	1	2026-07-23 08:21:00+05	2026-07-23 15:16:00+05	41.29977053417321	69.24018931346927	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
155	31	1	2026-07-23 08:16:00+05	2026-07-23 15:49:00+05	41.299691965251604	69.24047404320352	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
156	32	1	2026-07-23 08:18:00+05	2026-07-23 18:17:00+05	41.29977945722863	69.2401920352552	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
157	39	1	2026-07-23 08:18:00+05	2026-07-23 18:49:00+05	41.29980084031355	69.23975869377777	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
158	40	1	2026-07-23 08:24:00+05	2026-07-23 15:17:00+05	41.29925698129833	69.24011190663427	55	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
159	41	1	2026-07-23 08:01:00+05	2026-07-23 17:55:00+05	41.2991508550467	69.24026791959834	64	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
160	42	1	2026-07-23 08:13:00+05	2026-07-23 18:08:00+05	41.29981299866494	69.24045443117637	72	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
161	43	1	2026-07-23 08:18:00+05	2026-07-23 15:11:00+05	41.29927013832796	69.2397476978287	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
162	27	1	2026-07-23 08:01:00+05	2026-07-23 17:31:00+05	41.29960573120583	69.24039426354616	61	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
163	28	1	2026-07-23 08:17:00+05	2026-07-23 16:23:00+05	41.29971082854867	69.23978306006435	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
164	29	1	2026-07-23 08:07:00+05	2026-07-23 16:28:00+05	41.29969240948428	69.24030257971603	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
165	33	1	2026-07-24 08:24:00+05	2026-07-24 17:05:00+05	41.299601712827574	69.24048606425114	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
166	34	1	2026-07-24 08:24:00+05	2026-07-24 15:10:00+05	41.29973586472962	69.24038200774639	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
167	35	1	2026-07-24 08:23:00+05	2026-07-24 16:31:00+05	41.299341231601126	69.23970799952764	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
168	36	1	2026-07-24 08:16:00+05	2026-07-24 16:35:00+05	41.2993508750448	69.2401977548914	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
169	37	1	2026-07-24 08:02:00+05	2026-07-24 17:32:00+05	41.29949837053493	69.23996277282723	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
170	38	1	2026-07-24 08:21:00+05	2026-07-24 18:54:00+05	41.29918098354321	69.24027976428103	60	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
171	30	1	2026-07-24 08:19:00+05	2026-07-24 17:55:00+05	41.2998131913336	69.23997685251571	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
172	31	1	2026-07-24 08:15:00+05	2026-07-24 16:03:00+05	41.29917769162059	69.24034353652597	14	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
173	32	1	2026-07-24 08:00:00+05	2026-07-24 16:11:00+05	41.29933133432064	69.23998795606568	87	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
174	39	1	2026-07-24 08:21:00+05	2026-07-24 15:12:00+05	41.29987430321332	69.2399597434476	87	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
175	40	1	2026-07-24 08:20:00+05	2026-07-24 17:27:00+05	41.29982817348074	69.24019257353581	84	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
176	41	1	2026-07-24 08:21:00+05	2026-07-24 16:07:00+05	41.29915638234559	69.24046549446619	29	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
177	42	1	2026-07-24 08:20:00+05	2026-07-24 15:09:00+05	41.29929033657946	69.2398066273691	87	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
178	26	1	2026-07-24 08:03:00+05	2026-07-24 16:31:00+05	41.29924671456162	69.24044338173121	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
179	27	1	2026-07-24 08:01:00+05	2026-07-24 16:48:00+05	41.29973450845313	69.24044721371196	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
180	28	1	2026-07-24 08:04:00+05	2026-07-24 18:18:00+05	41.29937280273177	69.24009666769858	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
181	29	1	2026-07-24 08:00:00+05	2026-07-24 17:36:00+05	41.299231602123385	69.2398040311709	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
182	33	1	2026-07-25 08:07:00+05	2026-07-25 18:09:00+05	41.299263009720114	69.24016808894463	95	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
183	34	1	2026-07-25 08:19:00+05	2026-07-25 16:29:00+05	41.29980708695297	69.23984207749832	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
184	35	1	2026-07-25 08:07:00+05	2026-07-25 16:52:00+05	41.2998436125936	69.24014402461182	35	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
185	36	1	2026-07-25 08:09:00+05	2026-07-25 16:33:00+05	41.29980097955279	69.24028130540195	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
186	37	1	2026-07-25 08:06:00+05	2026-07-25 16:55:00+05	41.299748229320535	69.24041424001567	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
187	38	1	2026-07-25 08:13:00+05	2026-07-25 15:32:00+05	41.29923135167752	69.23984124300107	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
188	30	1	2026-07-25 08:03:00+05	2026-07-25 18:02:00+05	41.2993120354956	69.23987679953612	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
189	31	1	2026-07-25 08:13:00+05	2026-07-25 17:46:00+05	41.29934133621566	69.24049348487836	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
190	32	1	2026-07-25 08:25:00+05	2026-07-25 15:08:00+05	41.29949715731051	69.24032702002152	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
191	39	1	2026-07-25 08:01:00+05	2026-07-25 15:45:00+05	41.29973963119556	69.24045216324404	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
192	40	1	2026-07-25 08:16:00+05	2026-07-25 15:02:00+05	41.29976327281334	69.24019199771844	30	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
193	41	1	2026-07-25 08:07:00+05	2026-07-25 16:34:00+05	41.29934615385197	69.239775809055	92	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
194	42	1	2026-07-25 08:16:00+05	2026-07-25 16:31:00+05	41.2993381020248	69.24009597308022	84	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
195	43	1	2026-07-25 08:16:00+05	2026-07-25 17:22:00+05	41.299109033894915	69.24019138070214	29	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
196	26	1	2026-07-25 08:14:00+05	2026-07-25 17:32:00+05	41.299631097891925	69.23995875812061	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
197	27	1	2026-07-25 08:22:00+05	2026-07-25 15:32:00+05	41.29921401644312	69.23994991433435	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
198	28	1	2026-07-25 08:21:00+05	2026-07-25 18:00:00+05	41.29916744250693	69.23997720431983	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
199	29	1	2026-07-25 08:03:00+05	2026-07-25 15:49:00+05	41.29939681437686	69.24033299323673	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
200	33	1	2026-07-27 08:13:00+05	2026-07-27 18:39:00+05	41.29957570663654	69.23970813661032	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
201	34	1	2026-07-27 08:09:00+05	2026-07-27 17:35:00+05	41.2996229255043	69.23999577172361	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
202	35	1	2026-07-27 08:22:00+05	2026-07-27 15:45:00+05	41.299284591983074	69.24022148984204	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
203	36	1	2026-07-27 08:17:00+05	2026-07-27 17:20:00+05	41.29969986860846	69.2401202063037	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
204	30	1	2026-07-27 08:19:00+05	2026-07-27 18:22:00+05	41.299587951849965	69.239929004528	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
205	31	1	2026-07-27 08:25:00+05	2026-07-27 16:43:00+05	41.29969325831272	69.23993375114854	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
206	32	1	2026-07-27 08:19:00+05	2026-07-27 18:25:00+05	41.299648124274796	69.2402436107127	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.639353+05	2026-08-26 23:09:49.639353+05
207	39	1	2026-07-27 08:15:00+05	2026-07-27 15:34:00+05	41.29964160236735	69.23978167208787	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
208	40	1	2026-07-27 08:02:00+05	2026-07-27 16:00:00+05	41.29957611416765	69.2397918355925	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
209	42	1	2026-07-27 08:02:00+05	2026-07-27 17:08:00+05	41.29985254402459	69.2403898756925	81	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
210	26	1	2026-07-27 08:20:00+05	2026-07-27 17:47:00+05	41.299302599634416	69.24007206353097	74	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
211	27	1	2026-07-27 08:00:00+05	2026-07-27 15:50:00+05	41.299337808090826	69.24045472502951	58	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
212	28	1	2026-07-27 08:22:00+05	2026-07-27 18:31:00+05	41.299460552716255	69.2399529034771	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
213	29	1	2026-07-27 08:17:00+05	2026-07-27 16:20:00+05	41.29916895648297	69.24047157272436	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
214	33	1	2026-07-28 08:08:00+05	2026-07-28 17:33:00+05	41.29940290353485	69.2404183782272	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
215	34	1	2026-07-28 08:21:00+05	2026-07-28 17:54:00+05	41.299585496693666	69.23999725182298	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
216	35	1	2026-07-28 08:12:00+05	2026-07-28 15:43:00+05	41.299433503809944	69.24022611976545	85	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
217	36	1	2026-07-28 08:13:00+05	2026-07-28 15:07:00+05	41.299874894459734	69.24037902142815	76	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
218	38	1	2026-07-28 08:01:00+05	2026-07-28 16:29:00+05	41.29910640338268	69.23976590757538	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
219	30	1	2026-07-28 08:09:00+05	2026-07-28 16:53:00+05	41.29910033506099	69.24020404755883	53	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
220	31	1	2026-07-28 08:12:00+05	2026-07-28 16:27:00+05	41.299610575565694	69.23983352647349	54	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
221	32	1	2026-07-28 08:24:00+05	2026-07-28 15:32:00+05	41.29917564905044	69.24009920227304	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
222	39	1	2026-07-28 08:02:00+05	2026-07-28 15:05:00+05	41.299112267182025	69.24022086055894	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
223	41	1	2026-07-28 08:22:00+05	2026-07-28 15:37:00+05	41.299340908552146	69.24007061238811	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
224	42	1	2026-07-28 08:04:00+05	2026-07-28 18:18:00+05	41.299755403002166	69.24035808930192	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
225	43	1	2026-07-28 08:13:00+05	2026-07-28 16:03:00+05	41.299831257201916	69.24012755462769	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
226	26	1	2026-07-28 08:16:00+05	2026-07-28 16:13:00+05	41.29970513893031	69.23972403916679	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
227	27	1	2026-07-28 08:04:00+05	2026-07-28 18:33:00+05	41.29959479617719	69.24000658371206	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
228	28	1	2026-07-28 08:22:00+05	2026-07-28 16:06:00+05	41.29932804156933	69.24042990227025	20	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
229	29	1	2026-07-28 08:02:00+05	2026-07-28 18:18:00+05	41.2992846441349	69.24049000595994	85	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
230	33	1	2026-07-29 08:12:00+05	2026-07-29 15:00:00+05	41.299124403524026	69.24007254580371	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
231	34	1	2026-07-29 08:05:00+05	2026-07-29 17:41:00+05	41.299862632176094	69.24037802254166	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
232	35	1	2026-07-29 08:08:00+05	2026-07-29 15:02:00+05	41.299665983692556	69.24022488351315	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
233	36	1	2026-07-29 08:21:00+05	2026-07-29 18:55:00+05	41.29957085893937	69.24042393991668	13	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
234	37	1	2026-07-29 08:07:00+05	2026-07-29 16:33:00+05	41.29919630551282	69.24033462559208	17	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
235	38	1	2026-07-29 08:23:00+05	2026-07-29 16:16:00+05	41.29930001815297	69.24040014671218	52	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
236	30	1	2026-07-29 08:12:00+05	2026-07-29 16:28:00+05	41.29947821221501	69.24005544421169	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
237	31	1	2026-07-29 08:02:00+05	2026-07-29 17:53:00+05	41.299682908858735	69.23999219041113	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
238	32	1	2026-07-29 08:24:00+05	2026-07-29 17:18:00+05	41.29959630383812	69.24011770755294	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
239	39	1	2026-07-29 08:16:00+05	2026-07-29 17:32:00+05	41.29955850818995	69.2404797337558	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
240	40	1	2026-07-29 08:13:00+05	2026-07-29 17:48:00+05	41.29947856169809	69.24006002693548	81	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
241	41	1	2026-07-29 08:14:00+05	2026-07-29 16:34:00+05	41.29948755060453	69.23982652217596	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
242	42	1	2026-07-29 08:06:00+05	2026-07-29 16:10:00+05	41.29953803434279	69.23990070158169	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
243	43	1	2026-07-29 08:04:00+05	2026-07-29 15:23:00+05	41.299361580688135	69.24006122231576	88	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
244	26	1	2026-07-29 08:21:00+05	2026-07-29 18:02:00+05	41.29978072710447	69.24048905045278	13	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
245	29	1	2026-07-29 08:01:00+05	2026-07-29 17:02:00+05	41.2996990668526	69.2404186206542	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
246	33	1	2026-07-30 08:02:00+05	2026-07-30 15:32:00+05	41.299693040544916	69.24045087918155	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
247	35	1	2026-07-30 08:16:00+05	2026-07-30 17:17:00+05	41.299707062638554	69.23978804350104	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
248	36	1	2026-07-30 08:19:00+05	2026-07-30 17:02:00+05	41.299536114535854	69.24026736039276	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
249	37	1	2026-07-30 08:18:00+05	2026-07-30 17:01:00+05	41.2997568009222	69.23976288157459	52	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
250	38	1	2026-07-30 08:18:00+05	2026-07-30 15:28:00+05	41.299843052823846	69.23980664500557	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
251	30	1	2026-07-30 08:06:00+05	2026-07-30 18:18:00+05	41.29935250355751	69.24005525876879	84	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
252	31	1	2026-07-30 08:08:00+05	2026-07-30 17:33:00+05	41.29930801830851	69.24029075996857	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
253	32	1	2026-07-30 08:07:00+05	2026-07-30 18:25:00+05	41.299774803346956	69.24011225251779	65	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
254	40	1	2026-07-30 08:04:00+05	2026-07-30 18:24:00+05	41.29943982792404	69.24018359228913	65	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
255	41	1	2026-07-30 08:13:00+05	2026-07-30 15:14:00+05	41.299496397838	69.23993534507156	30	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
256	42	1	2026-07-30 08:19:00+05	2026-07-30 17:04:00+05	41.299828995030936	69.24020555785857	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
257	43	1	2026-07-30 08:23:00+05	2026-07-30 17:18:00+05	41.299644519308394	69.24048593725469	95	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
258	26	1	2026-07-30 08:03:00+05	2026-07-30 17:52:00+05	41.29934410775248	69.2403895949535	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
259	27	1	2026-07-30 08:05:00+05	2026-07-30 17:30:00+05	41.29913853417896	69.2400917898234	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
260	28	1	2026-07-30 08:07:00+05	2026-07-30 17:42:00+05	41.29913083690908	69.23991796120013	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
261	29	1	2026-07-30 08:14:00+05	2026-07-30 15:24:00+05	41.29940290409532	69.23975299820844	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
262	33	1	2026-07-31 08:14:00+05	2026-07-31 16:29:00+05	41.29986229045317	69.24038342715689	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
263	34	1	2026-07-31 08:09:00+05	2026-07-31 15:02:00+05	41.29936895131097	69.24021466311123	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
264	35	1	2026-07-31 08:20:00+05	2026-07-31 15:41:00+05	41.299793413632926	69.23992953842115	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
265	36	1	2026-07-31 08:08:00+05	2026-07-31 18:39:00+05	41.299353791001444	69.2398902067244	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
266	37	1	2026-07-31 08:16:00+05	2026-07-31 17:16:00+05	41.299371381635964	69.24030035307761	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
267	38	1	2026-07-31 08:16:00+05	2026-07-31 16:43:00+05	41.29915680358466	69.24044009957984	51	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
268	30	1	2026-07-31 08:14:00+05	2026-07-31 18:13:00+05	41.29972986302842	69.2401524562953	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
269	31	1	2026-07-31 08:14:00+05	2026-07-31 15:07:00+05	41.29932874219939	69.23982163888775	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
270	32	1	2026-07-31 08:18:00+05	2026-07-31 16:10:00+05	41.29932630699203	69.23981096673421	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
271	39	1	2026-07-31 08:14:00+05	2026-07-31 17:34:00+05	41.29948257240411	69.2399571786955	11	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
272	40	1	2026-07-31 08:01:00+05	2026-07-31 18:18:00+05	41.29927585763205	69.24016935550384	66	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
273	41	1	2026-07-31 08:25:00+05	2026-07-31 15:35:00+05	41.29974333402775	69.24019473789744	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
274	42	1	2026-07-31 08:13:00+05	2026-07-31 15:34:00+05	41.29949249001984	69.24020141706242	17	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
275	43	1	2026-07-31 08:14:00+05	2026-07-31 17:29:00+05	41.29938550876882	69.23974422814808	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
276	26	1	2026-07-31 08:25:00+05	2026-07-31 17:27:00+05	41.29975214016121	69.24003572746794	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
277	27	1	2026-07-31 08:20:00+05	2026-07-31 17:53:00+05	41.29961751394943	69.23994069762527	82	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
278	28	1	2026-07-31 08:20:00+05	2026-07-31 17:40:00+05	41.299194325706736	69.24014976785723	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
279	29	1	2026-07-31 08:10:00+05	2026-07-31 17:33:00+05	41.299675361238236	69.23979202277846	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
280	33	1	2026-08-01 08:22:00+05	2026-08-01 17:09:00+05	41.29940857578256	69.2399977232797	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
281	34	1	2026-08-01 08:15:00+05	2026-08-01 17:03:00+05	41.299474330499955	69.2403039215682	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
282	36	1	2026-08-01 08:15:00+05	2026-08-01 17:43:00+05	41.29930667810478	69.23973335455489	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
283	37	1	2026-08-01 08:09:00+05	2026-08-01 15:02:00+05	41.2998963551309	69.24015374501757	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
284	38	1	2026-08-01 08:07:00+05	2026-08-01 17:26:00+05	41.299294743527476	69.24048482913412	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
285	30	1	2026-08-01 08:09:00+05	2026-08-01 18:06:00+05	41.29936192736552	69.24017694652453	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
286	31	1	2026-08-01 08:11:00+05	2026-08-01 17:40:00+05	41.29956107342784	69.24034904123414	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
287	32	1	2026-08-01 08:00:00+05	2026-08-01 18:29:00+05	41.29966916989163	69.23973701372836	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
288	39	1	2026-08-01 08:20:00+05	2026-08-01 17:31:00+05	41.299699720981536	69.23975273168217	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
289	40	1	2026-08-01 08:06:00+05	2026-08-01 16:54:00+05	41.29928138222378	69.24028995791245	57	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
290	41	1	2026-08-01 08:10:00+05	2026-08-01 18:47:00+05	41.299848677340336	69.23998693257198	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
291	42	1	2026-08-01 08:17:00+05	2026-08-01 17:15:00+05	41.29956906225123	69.24006663876455	52	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
292	43	1	2026-08-01 08:00:00+05	2026-08-01 15:05:00+05	41.29958355495446	69.24043025641944	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
293	26	1	2026-08-01 08:13:00+05	2026-08-01 17:49:00+05	41.299503620326895	69.23973492052927	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
294	27	1	2026-08-01 08:07:00+05	2026-08-01 16:10:00+05	41.29965376833845	69.2397799607899	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
295	28	1	2026-08-01 08:15:00+05	2026-08-01 15:53:00+05	41.29986575566605	69.2401046988897	7	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
296	29	1	2026-08-01 08:05:00+05	2026-08-01 15:30:00+05	41.29911327984501	69.2400783213159	82	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
297	33	1	2026-08-03 08:12:00+05	2026-08-03 18:23:00+05	41.299748738204315	69.24010063284095	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
298	34	1	2026-08-03 08:09:00+05	2026-08-03 15:03:00+05	41.29929939818885	69.24039548683147	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
299	35	1	2026-08-03 08:24:00+05	2026-08-03 18:11:00+05	41.29975887206048	69.24040297408979	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
300	36	1	2026-08-03 08:18:00+05	2026-08-03 17:10:00+05	41.29925992072225	69.24037301445901	22	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
301	37	1	2026-08-03 08:23:00+05	2026-08-03 17:20:00+05	41.29947929100227	69.24040459829997	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
302	38	1	2026-08-03 08:15:00+05	2026-08-03 18:37:00+05	41.299774138976446	69.24003086520173	11	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
303	30	1	2026-08-03 08:24:00+05	2026-08-03 16:07:00+05	41.299792016329434	69.24015340128038	51	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
304	31	1	2026-08-03 08:11:00+05	2026-08-03 17:21:00+05	41.299232378023866	69.24030938058141	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
305	32	1	2026-08-03 08:14:00+05	2026-08-03 17:49:00+05	41.29929905646276	69.24042907465565	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
306	40	1	2026-08-03 08:12:00+05	2026-08-03 15:21:00+05	41.29917652881201	69.24046667330451	22	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
307	41	1	2026-08-03 08:10:00+05	2026-08-03 15:48:00+05	41.299369911435434	69.24013858267683	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
308	42	1	2026-08-03 08:21:00+05	2026-08-03 16:22:00+05	41.299723893546314	69.24013907144143	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
309	43	1	2026-08-03 08:06:00+05	2026-08-03 17:34:00+05	41.29913066137452	69.24007853703237	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
310	26	1	2026-08-03 08:20:00+05	2026-08-03 15:45:00+05	41.29969825331532	69.23985766579862	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
311	27	1	2026-08-03 08:10:00+05	2026-08-03 17:16:00+05	41.299636851721814	69.23973669021241	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
312	28	1	2026-08-03 08:13:00+05	2026-08-03 18:31:00+05	41.29944270610456	69.23971467983145	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
313	29	1	2026-08-03 08:14:00+05	2026-08-03 17:53:00+05	41.29967261842601	69.24041590083837	55	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
314	33	1	2026-08-04 08:00:00+05	2026-08-04 16:31:00+05	41.29939394349307	69.24033223266453	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
315	34	1	2026-08-04 08:22:00+05	2026-08-04 17:24:00+05	41.29928537156657	69.23972746570837	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
316	35	1	2026-08-04 08:10:00+05	2026-08-04 17:18:00+05	41.2991005475333	69.24004983856753	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
317	36	1	2026-08-04 08:22:00+05	2026-08-04 16:43:00+05	41.299250870439224	69.2403595453836	74	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
318	37	1	2026-08-04 08:18:00+05	2026-08-04 17:32:00+05	41.29925548183955	69.24005436036065	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
319	38	1	2026-08-04 08:23:00+05	2026-08-04 16:27:00+05	41.299457311723195	69.24027790795284	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
320	30	1	2026-08-04 08:05:00+05	2026-08-04 18:30:00+05	41.299377483605035	69.2398883931879	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
321	31	1	2026-08-04 08:24:00+05	2026-08-04 18:33:00+05	41.2997441123968	69.23999645611197	61	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
322	32	1	2026-08-04 08:18:00+05	2026-08-04 17:09:00+05	41.299488272905165	69.23982597723976	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
323	40	1	2026-08-04 08:11:00+05	2026-08-04 17:04:00+05	41.299828770306895	69.24031372090857	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
324	41	1	2026-08-04 08:24:00+05	2026-08-04 18:02:00+05	41.29951548841633	69.24046916062497	88	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
325	42	1	2026-08-04 08:10:00+05	2026-08-04 18:30:00+05	41.29941224335079	69.23994081172607	92	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
326	43	1	2026-08-04 08:00:00+05	2026-08-04 17:08:00+05	41.29911146827378	69.24031639867276	66	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
327	27	1	2026-08-04 08:16:00+05	2026-08-04 15:10:00+05	41.2991991580654	69.24049698986876	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
328	28	1	2026-08-04 08:13:00+05	2026-08-04 18:02:00+05	41.299587046245485	69.24018678682596	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
329	29	1	2026-08-04 08:23:00+05	2026-08-04 17:35:00+05	41.29959227269441	69.2404177367542	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
330	33	1	2026-08-05 08:18:00+05	2026-08-05 15:55:00+05	41.29913536480069	69.24028653457258	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
331	34	1	2026-08-05 08:04:00+05	2026-08-05 18:52:00+05	41.29924075529333	69.24008329965416	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
332	36	1	2026-08-05 08:01:00+05	2026-08-05 15:11:00+05	41.29924475222044	69.23994520673678	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
333	37	1	2026-08-05 08:17:00+05	2026-08-05 15:27:00+05	41.299842757246275	69.24027796136886	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
334	38	1	2026-08-05 08:06:00+05	2026-08-05 16:12:00+05	41.29986810709108	69.24001133156587	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
335	30	1	2026-08-05 08:23:00+05	2026-08-05 17:14:00+05	41.29955516460873	69.24013742956575	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
336	31	1	2026-08-05 08:12:00+05	2026-08-05 15:21:00+05	41.2992061023416	69.240238369181	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
337	32	1	2026-08-05 08:09:00+05	2026-08-05 15:45:00+05	41.29960269129668	69.24011690984666	72	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
338	39	1	2026-08-05 08:05:00+05	2026-08-05 15:51:00+05	41.29957271796558	69.24040475103463	14	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
339	41	1	2026-08-05 08:18:00+05	2026-08-05 16:07:00+05	41.2997230682252	69.2398892691264	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
340	42	1	2026-08-05 08:15:00+05	2026-08-05 18:19:00+05	41.299498258162664	69.23982456826195	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
341	43	1	2026-08-05 08:03:00+05	2026-08-05 15:38:00+05	41.299521470602976	69.23996637607478	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
342	27	1	2026-08-05 08:03:00+05	2026-08-05 18:13:00+05	41.299512686221675	69.23989521115199	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
343	28	1	2026-08-05 08:00:00+05	2026-08-05 17:20:00+05	41.29957385256421	69.2397853988612	65	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
344	33	1	2026-08-06 08:21:00+05	2026-08-06 18:21:00+05	41.29966396899149	69.24023671214302	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
345	34	1	2026-08-06 08:11:00+05	2026-08-06 16:19:00+05	41.29940628074445	69.2402944160305	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
346	35	1	2026-08-06 08:01:00+05	2026-08-06 16:04:00+05	41.299364689440466	69.23977541813478	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
347	36	1	2026-08-06 08:11:00+05	2026-08-06 17:41:00+05	41.29976398347337	69.24005515500623	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
348	37	1	2026-08-06 08:10:00+05	2026-08-06 16:12:00+05	41.299424248314466	69.24008583712447	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
349	38	1	2026-08-06 08:16:00+05	2026-08-06 15:53:00+05	41.2998390512798	69.23974362165816	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
350	30	1	2026-08-06 08:09:00+05	2026-08-06 18:02:00+05	41.29932951555867	69.24033190741166	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
351	31	1	2026-08-06 08:03:00+05	2026-08-06 16:06:00+05	41.299870146456364	69.24030997613892	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
352	32	1	2026-08-06 08:16:00+05	2026-08-06 15:23:00+05	41.299323478369786	69.24017103709355	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
353	39	1	2026-08-06 08:04:00+05	2026-08-06 16:33:00+05	41.299163334535066	69.24035607926156	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
354	40	1	2026-08-06 08:12:00+05	2026-08-06 15:44:00+05	41.299295840589515	69.23997015227582	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
355	41	1	2026-08-06 08:17:00+05	2026-08-06 15:14:00+05	41.29915701222718	69.24016955295782	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
356	42	1	2026-08-06 08:02:00+05	2026-08-06 18:04:00+05	41.299459000032584	69.23974842144624	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
357	43	1	2026-08-06 08:20:00+05	2026-08-06 17:54:00+05	41.299656785032155	69.24027778386753	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
358	26	1	2026-08-06 08:00:00+05	2026-08-06 16:34:00+05	41.29953901354708	69.24039055320434	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
359	27	1	2026-08-06 08:01:00+05	2026-08-06 17:03:00+05	41.29924276328348	69.24005231630038	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
360	28	1	2026-08-06 08:16:00+05	2026-08-06 16:26:00+05	41.29941188209839	69.24032658987026	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
361	29	1	2026-08-06 08:12:00+05	2026-08-06 18:23:00+05	41.29983222012408	69.24034599405006	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
362	33	1	2026-08-07 08:24:00+05	2026-08-07 15:13:00+05	41.29980405472964	69.2402878941996	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
363	34	1	2026-08-07 08:01:00+05	2026-08-07 18:24:00+05	41.29953905126527	69.24004765553623	58	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
364	35	1	2026-08-07 08:12:00+05	2026-08-07 17:04:00+05	41.2994302741468	69.24032422833946	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
365	37	1	2026-08-07 08:01:00+05	2026-08-07 18:07:00+05	41.29930628334396	69.24022043337821	17	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
366	38	1	2026-08-07 08:14:00+05	2026-08-07 15:29:00+05	41.299806526408716	69.24015517118983	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
367	30	1	2026-08-07 08:02:00+05	2026-08-07 18:06:00+05	41.29917224082351	69.23995037896223	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
368	31	1	2026-08-07 08:01:00+05	2026-08-07 15:05:00+05	41.29955426904355	69.24000150901452	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
369	32	1	2026-08-07 08:16:00+05	2026-08-07 18:19:00+05	41.29966029236764	69.2398488744745	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
370	39	1	2026-08-07 08:06:00+05	2026-08-07 18:10:00+05	41.29979979558643	69.24030366563852	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
371	40	1	2026-08-07 08:14:00+05	2026-08-07 17:53:00+05	41.2992290329732	69.23981020600925	95	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
372	41	1	2026-08-07 08:17:00+05	2026-08-07 15:11:00+05	41.29963777108304	69.2402640193399	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
373	43	1	2026-08-07 08:25:00+05	2026-08-07 16:19:00+05	41.29953297932484	69.2398818388585	14	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
374	26	1	2026-08-07 08:24:00+05	2026-08-07 15:07:00+05	41.299605682465625	69.24005972367841	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
375	27	1	2026-08-07 08:17:00+05	2026-08-07 16:02:00+05	41.299235203873366	69.23978560488914	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
376	29	1	2026-08-07 08:00:00+05	2026-08-07 15:34:00+05	41.29954291587528	69.23980848908778	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
377	34	1	2026-08-08 08:15:00+05	2026-08-08 15:35:00+05	41.299380405981466	69.23998255634773	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
378	35	1	2026-08-08 08:07:00+05	2026-08-08 18:21:00+05	41.29939576024786	69.24010939813722	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
379	36	1	2026-08-08 08:23:00+05	2026-08-08 15:50:00+05	41.2992792188406	69.23973489739522	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
380	37	1	2026-08-08 08:07:00+05	2026-08-08 15:28:00+05	41.29917294972223	69.24046793284397	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
381	38	1	2026-08-08 08:20:00+05	2026-08-08 15:01:00+05	41.29940599470325	69.24029110200554	44	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
382	30	1	2026-08-08 08:21:00+05	2026-08-08 16:09:00+05	41.299110630924815	69.24039302007444	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
383	31	1	2026-08-08 08:09:00+05	2026-08-08 16:45:00+05	41.2992234597791	69.24017705772071	64	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
384	32	1	2026-08-08 08:22:00+05	2026-08-08 15:44:00+05	41.29971024435572	69.23971621281076	81	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
385	39	1	2026-08-08 08:16:00+05	2026-08-08 18:28:00+05	41.29914116088748	69.23972162364181	79	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
386	40	1	2026-08-08 08:04:00+05	2026-08-08 17:12:00+05	41.2991411573466	69.24002407641038	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
387	41	1	2026-08-08 08:24:00+05	2026-08-08 16:07:00+05	41.29924066068996	69.24000174663402	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
388	42	1	2026-08-08 08:23:00+05	2026-08-08 15:03:00+05	41.29973075096663	69.24013041884676	53	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
389	43	1	2026-08-08 08:23:00+05	2026-08-08 18:18:00+05	41.29937161584124	69.24022076184768	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
390	27	1	2026-08-08 08:21:00+05	2026-08-08 16:25:00+05	41.29964967120886	69.24003976092767	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
391	28	1	2026-08-08 08:01:00+05	2026-08-08 17:36:00+05	41.299752514171786	69.23981176327281	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
392	29	1	2026-08-08 08:17:00+05	2026-08-08 18:13:00+05	41.29983939883635	69.23976562234479	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
393	33	1	2026-08-10 08:01:00+05	2026-08-10 16:54:00+05	41.29945547543634	69.24000890790467	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
394	35	1	2026-08-10 08:22:00+05	2026-08-10 17:24:00+05	41.29961549618617	69.24002536783833	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
395	36	1	2026-08-10 08:04:00+05	2026-08-10 18:28:00+05	41.29932505479809	69.24017421983537	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
396	37	1	2026-08-10 08:07:00+05	2026-08-10 18:55:00+05	41.29978894623407	69.2397871676486	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
397	38	1	2026-08-10 08:16:00+05	2026-08-10 17:29:00+05	41.29963908144739	69.24026696581133	8	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
398	30	1	2026-08-10 08:20:00+05	2026-08-10 18:07:00+05	41.29986699483003	69.23994355225004	13	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
399	32	1	2026-08-10 08:07:00+05	2026-08-10 18:29:00+05	41.29936967964992	69.24042113418784	14	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
400	39	1	2026-08-10 08:23:00+05	2026-08-10 16:39:00+05	41.299320947727004	69.24005916945468	11	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
401	40	1	2026-08-10 08:04:00+05	2026-08-10 16:40:00+05	41.29967104810756	69.24003166612722	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
402	41	1	2026-08-10 08:13:00+05	2026-08-10 15:43:00+05	41.29920856024008	69.24014054301512	87	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
403	42	1	2026-08-10 08:19:00+05	2026-08-10 15:20:00+05	41.29987267882228	69.24008411201238	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
404	26	1	2026-08-10 08:19:00+05	2026-08-10 17:20:00+05	41.29989169247989	69.24020804747622	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
405	27	1	2026-08-10 08:18:00+05	2026-08-10 17:46:00+05	41.29982450677175	69.2403985816963	13	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
406	28	1	2026-08-10 08:18:00+05	2026-08-10 18:21:00+05	41.29933940772973	69.2397868699491	58	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.652973+05	2026-08-26 23:09:49.652973+05
407	29	1	2026-08-10 08:20:00+05	2026-08-10 16:50:00+05	41.29940866225325	69.2398247207731	33	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
408	33	1	2026-08-11 08:17:00+05	2026-08-11 18:15:00+05	41.29980435468294	69.24006475411747	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
409	34	1	2026-08-11 08:18:00+05	2026-08-11 15:19:00+05	41.29918960539382	69.23975764970258	60	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
410	35	1	2026-08-11 08:02:00+05	2026-08-11 16:12:00+05	41.29910292033665	69.23993748129439	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
411	36	1	2026-08-11 08:04:00+05	2026-08-11 18:27:00+05	41.299478933194656	69.2397250451576	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
412	37	1	2026-08-11 08:14:00+05	2026-08-11 17:26:00+05	41.29947302017641	69.2402351566542	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
413	38	1	2026-08-11 08:16:00+05	2026-08-11 17:43:00+05	41.29910364213362	69.2400857038511	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
414	30	1	2026-08-11 08:15:00+05	2026-08-11 17:53:00+05	41.29951560962722	69.23997145702708	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
415	31	1	2026-08-11 08:06:00+05	2026-08-11 18:08:00+05	41.29980469768606	69.24028096888307	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
416	32	1	2026-08-11 08:22:00+05	2026-08-11 17:45:00+05	41.299366944113935	69.23988768743835	40	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
417	39	1	2026-08-11 08:21:00+05	2026-08-11 16:22:00+05	41.299369132613954	69.24032590799537	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
418	40	1	2026-08-11 08:14:00+05	2026-08-11 18:37:00+05	41.299251266460125	69.24033546980135	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
419	41	1	2026-08-11 08:15:00+05	2026-08-11 17:24:00+05	41.29986819370594	69.24003771629036	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
420	43	1	2026-08-11 08:23:00+05	2026-08-11 18:33:00+05	41.29972165805921	69.24041216491499	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
421	26	1	2026-08-11 08:19:00+05	2026-08-11 15:20:00+05	41.29922199654691	69.2402091538595	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
422	27	1	2026-08-11 08:13:00+05	2026-08-11 15:11:00+05	41.29913745717667	69.24006909989082	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
423	28	1	2026-08-11 08:16:00+05	2026-08-11 18:17:00+05	41.29913039767668	69.23987396954894	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
424	29	1	2026-08-11 08:23:00+05	2026-08-11 18:37:00+05	41.29983310304489	69.2399361454269	85	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
425	33	1	2026-08-12 08:23:00+05	2026-08-12 17:10:00+05	41.29934662051648	69.23986877776217	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
426	34	1	2026-08-12 08:17:00+05	2026-08-12 18:13:00+05	41.29988118406311	69.24007094185296	8	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
427	35	1	2026-08-12 08:09:00+05	2026-08-12 16:49:00+05	41.29916169711221	69.2403996644713	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
428	36	1	2026-08-12 08:19:00+05	2026-08-12 15:24:00+05	41.29978825952299	69.24029849584922	83	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
429	37	1	2026-08-12 08:10:00+05	2026-08-12 15:47:00+05	41.299834438907915	69.23972232109439	65	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
430	38	1	2026-08-12 08:22:00+05	2026-08-12 17:52:00+05	41.29917158016451	69.24040133927483	47	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
431	30	1	2026-08-12 08:18:00+05	2026-08-12 17:37:00+05	41.29979309039116	69.23978129456341	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
432	31	1	2026-08-12 08:09:00+05	2026-08-12 15:06:00+05	41.29932254442536	69.24036006252076	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
433	32	1	2026-08-12 08:16:00+05	2026-08-12 15:33:00+05	41.299788411509994	69.24045993815362	78	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
434	40	1	2026-08-12 08:06:00+05	2026-08-12 18:06:00+05	41.29986896498595	69.23982542031314	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
435	41	1	2026-08-12 08:24:00+05	2026-08-12 17:15:00+05	41.29961420973521	69.2399055793913	25	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
436	42	1	2026-08-12 08:18:00+05	2026-08-12 15:23:00+05	41.29964880819451	69.24037656692266	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
437	43	1	2026-08-12 08:16:00+05	2026-08-12 18:04:00+05	41.29941446524989	69.24000224037096	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
438	27	1	2026-08-12 08:12:00+05	2026-08-12 17:03:00+05	41.29936633577664	69.2397193851715	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
439	28	1	2026-08-12 08:13:00+05	2026-08-12 17:29:00+05	41.29937173110805	69.24010373297892	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
440	29	1	2026-08-12 08:17:00+05	2026-08-12 17:37:00+05	41.29943582873344	69.2401491037609	53	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
441	33	1	2026-08-13 08:11:00+05	2026-08-13 15:50:00+05	41.29965230627693	69.239811050882	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
442	34	1	2026-08-13 08:01:00+05	2026-08-13 18:29:00+05	41.29958808659259	69.24043625767044	8	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
443	35	1	2026-08-13 08:12:00+05	2026-08-13 16:51:00+05	41.2991927346997	69.24028388438914	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
444	36	1	2026-08-13 08:01:00+05	2026-08-13 17:47:00+05	41.29976655125693	69.24001673153788	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
445	37	1	2026-08-13 08:09:00+05	2026-08-13 15:45:00+05	41.29925922833514	69.24022053945102	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
446	38	1	2026-08-13 08:19:00+05	2026-08-13 17:49:00+05	41.299511205805096	69.2397270400364	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
447	30	1	2026-08-13 08:11:00+05	2026-08-13 17:29:00+05	41.29931269963701	69.23997690384053	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
448	31	1	2026-08-13 08:17:00+05	2026-08-13 16:55:00+05	41.29936375586949	69.24025847952495	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
449	32	1	2026-08-13 08:05:00+05	2026-08-13 15:29:00+05	41.29936857583672	69.2399050888244	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
450	39	1	2026-08-13 08:22:00+05	2026-08-13 16:54:00+05	41.29964268029891	69.24033507665452	54	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
451	40	1	2026-08-13 08:03:00+05	2026-08-13 17:23:00+05	41.299679720297085	69.2400304363273	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
452	41	1	2026-08-13 08:02:00+05	2026-08-13 15:31:00+05	41.299295313614984	69.240107374412	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
453	42	1	2026-08-13 08:03:00+05	2026-08-13 15:54:00+05	41.29916504496522	69.23999661599193	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
454	43	1	2026-08-13 08:23:00+05	2026-08-13 15:27:00+05	41.299447276050785	69.23980278012752	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
455	26	1	2026-08-13 08:08:00+05	2026-08-13 16:29:00+05	41.29939474437628	69.2403034067262	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
456	27	1	2026-08-13 08:22:00+05	2026-08-13 15:15:00+05	41.299574886689335	69.24029133390914	8	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
457	28	1	2026-08-13 08:25:00+05	2026-08-13 18:46:00+05	41.29985151664801	69.24010030614585	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
458	29	1	2026-08-13 08:11:00+05	2026-08-13 17:17:00+05	41.299550784976226	69.24027449514978	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
459	33	1	2026-08-14 08:03:00+05	2026-08-14 16:10:00+05	41.2997395396201	69.24022517545353	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
460	35	1	2026-08-14 08:11:00+05	2026-08-14 18:49:00+05	41.29927595834528	69.24027643034476	18	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
461	36	1	2026-08-14 08:07:00+05	2026-08-14 17:17:00+05	41.29954589310792	69.24040972333773	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
462	37	1	2026-08-14 08:07:00+05	2026-08-14 15:45:00+05	41.29968274044488	69.23997492197472	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
463	30	1	2026-08-14 08:03:00+05	2026-08-14 15:26:00+05	41.29968952152897	69.24041040641274	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
464	31	1	2026-08-14 08:23:00+05	2026-08-14 18:41:00+05	41.29946955545284	69.24023824700303	76	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
465	32	1	2026-08-14 08:06:00+05	2026-08-14 17:31:00+05	41.29939198515397	69.23996338794622	54	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
466	39	1	2026-08-14 08:05:00+05	2026-08-14 17:42:00+05	41.299122907257455	69.23985863491147	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
467	40	1	2026-08-14 08:15:00+05	2026-08-14 15:50:00+05	41.29966069047265	69.24000993836223	79	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
468	41	1	2026-08-14 08:20:00+05	2026-08-14 15:37:00+05	41.29910663433727	69.24045697563179	54	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
469	43	1	2026-08-14 08:19:00+05	2026-08-14 18:01:00+05	41.299129815702514	69.24013854337521	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
470	26	1	2026-08-14 08:10:00+05	2026-08-14 18:16:00+05	41.29931738029309	69.24042158199343	66	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
471	28	1	2026-08-14 08:24:00+05	2026-08-14 15:35:00+05	41.29970816929657	69.23974491010122	8	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
472	29	1	2026-08-14 08:20:00+05	2026-08-14 15:02:00+05	41.299559457076526	69.23979781093429	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
473	33	1	2026-08-15 08:09:00+05	2026-08-15 18:07:00+05	41.29934697485864	69.2399258961644	88	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
474	35	1	2026-08-15 08:25:00+05	2026-08-15 17:09:00+05	41.29956953077857	69.23983514504674	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
475	36	1	2026-08-15 08:08:00+05	2026-08-15 18:47:00+05	41.299813490956275	69.23976923401727	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
476	37	1	2026-08-15 08:19:00+05	2026-08-15 16:24:00+05	41.29937129575647	69.24013490785266	55	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
477	38	1	2026-08-15 08:13:00+05	2026-08-15 16:02:00+05	41.29942090744563	69.23998078965712	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
478	30	1	2026-08-15 08:03:00+05	2026-08-15 15:45:00+05	41.29934305921476	69.24046268807481	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
479	32	1	2026-08-15 08:09:00+05	2026-08-15 16:51:00+05	41.29946568239462	69.24035946759675	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
480	39	1	2026-08-15 08:20:00+05	2026-08-15 15:13:00+05	41.29975959091503	69.24018068260568	76	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
481	40	1	2026-08-15 08:03:00+05	2026-08-15 18:20:00+05	41.299641689894536	69.2404973551102	74	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
482	41	1	2026-08-15 08:03:00+05	2026-08-15 17:30:00+05	41.29972338770405	69.2399708222894	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
483	42	1	2026-08-15 08:00:00+05	2026-08-15 16:07:00+05	41.29930786025934	69.24034503017478	53	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
484	26	1	2026-08-15 08:00:00+05	2026-08-15 15:37:00+05	41.29982893148269	69.23985962260608	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
485	27	1	2026-08-15 08:10:00+05	2026-08-15 18:26:00+05	41.29949737237152	69.24002536139245	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
486	29	1	2026-08-15 08:08:00+05	2026-08-15 18:10:00+05	41.29941492633987	69.23973896423671	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
487	33	1	2026-08-17 08:11:00+05	2026-08-17 16:29:00+05	41.29937418385558	69.24036733582615	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
488	34	1	2026-08-17 08:21:00+05	2026-08-17 17:54:00+05	41.299776743810064	69.23998380814679	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
489	36	1	2026-08-17 08:16:00+05	2026-08-17 15:31:00+05	41.299532291053985	69.24044443732389	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
490	37	1	2026-08-17 08:14:00+05	2026-08-17 17:02:00+05	41.299632883901154	69.23994687757566	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
491	38	1	2026-08-17 08:01:00+05	2026-08-17 18:29:00+05	41.29917948231679	69.23977967616226	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
492	30	1	2026-08-17 08:12:00+05	2026-08-17 16:28:00+05	41.2993920397738	69.24009171601422	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
493	31	1	2026-08-17 08:06:00+05	2026-08-17 17:32:00+05	41.29953314033225	69.24004924279824	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
494	32	1	2026-08-17 08:24:00+05	2026-08-17 17:16:00+05	41.29965944204014	69.24025713407006	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
495	39	1	2026-08-17 08:13:00+05	2026-08-17 15:13:00+05	41.29977499871645	69.24031742899399	51	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
496	40	1	2026-08-17 08:05:00+05	2026-08-17 18:03:00+05	41.29960262127873	69.240114181255	89	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
497	41	1	2026-08-17 08:25:00+05	2026-08-17 18:53:00+05	41.29976436453108	69.24043259940949	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
498	42	1	2026-08-17 08:09:00+05	2026-08-17 16:11:00+05	41.299833895294185	69.24039810889046	86	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
499	43	1	2026-08-17 08:20:00+05	2026-08-17 16:29:00+05	41.299881901842355	69.24033745462485	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
500	26	1	2026-08-17 08:01:00+05	2026-08-17 17:40:00+05	41.29912550696377	69.24003115986176	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
501	27	1	2026-08-17 08:25:00+05	2026-08-17 18:39:00+05	41.29940365729537	69.24040864108578	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
502	28	1	2026-08-17 08:21:00+05	2026-08-17 15:02:00+05	41.29979263021555	69.23970598676839	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
503	33	1	2026-08-18 08:21:00+05	2026-08-18 16:19:00+05	41.2991205370659	69.23995736233107	58	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
504	34	1	2026-08-18 08:17:00+05	2026-08-18 17:33:00+05	41.29940352929905	69.24024207265973	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
505	36	1	2026-08-18 08:06:00+05	2026-08-18 15:42:00+05	41.29922894074265	69.24049277345799	26	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
506	37	1	2026-08-18 08:10:00+05	2026-08-18 18:54:00+05	41.29961440530923	69.24029399869535	91	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
507	38	1	2026-08-18 08:07:00+05	2026-08-18 16:19:00+05	41.29969633683488	69.23979729048703	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
508	30	1	2026-08-18 08:06:00+05	2026-08-18 18:01:00+05	41.29979730162714	69.2397826602986	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
509	31	1	2026-08-18 08:04:00+05	2026-08-18 17:35:00+05	41.29962368839942	69.23972518966198	58	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
510	32	1	2026-08-18 08:10:00+05	2026-08-18 15:17:00+05	41.2995057841016	69.23998522095009	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
511	39	1	2026-08-18 08:16:00+05	2026-08-18 17:52:00+05	41.299661767747445	69.24007551381607	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
512	40	1	2026-08-18 08:04:00+05	2026-08-18 18:20:00+05	41.29956719929949	69.24030256082415	85	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
513	41	1	2026-08-18 08:17:00+05	2026-08-18 15:04:00+05	41.299151330246964	69.24005972876753	45	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
514	42	1	2026-08-18 08:23:00+05	2026-08-18 16:11:00+05	41.29960175821949	69.24018850679863	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
515	43	1	2026-08-18 08:22:00+05	2026-08-18 17:43:00+05	41.299675502238614	69.24045273003225	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
516	26	1	2026-08-18 08:19:00+05	2026-08-18 18:03:00+05	41.29975192127209	69.23988147696647	7	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
517	27	1	2026-08-18 08:13:00+05	2026-08-18 15:44:00+05	41.299308711354065	69.24013165779598	15	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
518	28	1	2026-08-18 08:15:00+05	2026-08-18 17:49:00+05	41.29920514942389	69.2397900637757	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
519	29	1	2026-08-18 08:19:00+05	2026-08-18 16:19:00+05	41.29943688820005	69.24040980153046	40	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
520	33	1	2026-08-19 08:25:00+05	2026-08-19 18:48:00+05	41.29933745611124	69.23989125057496	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
521	34	1	2026-08-19 08:03:00+05	2026-08-19 15:15:00+05	41.299607963652726	69.24049148792811	52	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
522	35	1	2026-08-19 08:16:00+05	2026-08-19 17:04:00+05	41.29925115189199	69.24048169320058	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
523	36	1	2026-08-19 08:25:00+05	2026-08-19 15:39:00+05	41.29943549925052	69.24015933547803	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
524	37	1	2026-08-19 08:00:00+05	2026-08-19 16:11:00+05	41.299743088869754	69.24018086469825	67	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
525	38	1	2026-08-19 08:06:00+05	2026-08-19 15:12:00+05	41.299839271852	69.23999501586016	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
526	30	1	2026-08-19 08:24:00+05	2026-08-19 18:53:00+05	41.29938390651625	69.24007196569517	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
527	31	1	2026-08-19 08:23:00+05	2026-08-19 15:18:00+05	41.29918264591769	69.23991423997431	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
528	40	1	2026-08-19 08:15:00+05	2026-08-19 18:17:00+05	41.29987411938198	69.24044547608048	92	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
529	42	1	2026-08-19 08:22:00+05	2026-08-19 15:25:00+05	41.2995476019647	69.23983116214704	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
530	27	1	2026-08-19 08:13:00+05	2026-08-19 15:06:00+05	41.29973584851995	69.24020472310018	50	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
531	28	1	2026-08-19 08:22:00+05	2026-08-19 18:43:00+05	41.29971777176764	69.24020084983725	37	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
532	29	1	2026-08-19 08:18:00+05	2026-08-19 17:45:00+05	41.299183641309476	69.24037476022895	95	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
533	33	1	2026-08-20 08:07:00+05	2026-08-20 18:55:00+05	41.2992197349865	69.23976457763723	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
534	34	1	2026-08-20 08:18:00+05	2026-08-20 15:36:00+05	41.29978804208525	69.24020900864768	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
535	35	1	2026-08-20 08:21:00+05	2026-08-20 16:07:00+05	41.29989306044672	69.24044049721695	29	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
536	36	1	2026-08-20 08:02:00+05	2026-08-20 15:10:00+05	41.29915605084468	69.2401695575824	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
537	37	1	2026-08-20 08:15:00+05	2026-08-20 15:28:00+05	41.29978664558083	69.2400868948644	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
538	38	1	2026-08-20 08:21:00+05	2026-08-20 15:12:00+05	41.29942493747603	69.2403301898012	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
539	30	1	2026-08-20 08:00:00+05	2026-08-20 15:24:00+05	41.29965657190103	69.23971890497337	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
540	31	1	2026-08-20 08:09:00+05	2026-08-20 18:05:00+05	41.2996516100917	69.24041836027466	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
541	32	1	2026-08-20 08:01:00+05	2026-08-20 16:10:00+05	41.29969045485444	69.24005726116616	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
542	39	1	2026-08-20 08:04:00+05	2026-08-20 17:32:00+05	41.29960807957892	69.23989837122522	55	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
543	40	1	2026-08-20 08:23:00+05	2026-08-20 15:47:00+05	41.299719172877076	69.24033903594334	36	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
544	41	1	2026-08-20 08:05:00+05	2026-08-20 15:08:00+05	41.299202358241565	69.24032415797524	63	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
545	42	1	2026-08-20 08:23:00+05	2026-08-20 16:35:00+05	41.29973512475491	69.23982629775386	34	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
546	43	1	2026-08-20 08:01:00+05	2026-08-20 17:47:00+05	41.29959244689122	69.24020286350715	56	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
547	26	1	2026-08-20 08:23:00+05	2026-08-20 17:26:00+05	41.29945791112334	69.24040626951549	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
548	28	1	2026-08-20 08:05:00+05	2026-08-20 17:36:00+05	41.299674350097774	69.24022319415863	24	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
549	33	1	2026-08-21 08:19:00+05	2026-08-21 17:46:00+05	41.299844665352815	69.24045450606197	55	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
550	34	1	2026-08-21 08:02:00+05	2026-08-21 16:16:00+05	41.29917618869171	69.2404399959825	31	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
551	35	1	2026-08-21 08:00:00+05	2026-08-21 16:20:00+05	41.299329619125835	69.24012986235488	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
552	37	1	2026-08-21 08:14:00+05	2026-08-21 16:27:00+05	41.299688522495515	69.24016210420895	29	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
553	38	1	2026-08-21 08:14:00+05	2026-08-21 16:32:00+05	41.299326876864214	69.24039774326626	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
554	30	1	2026-08-21 08:05:00+05	2026-08-21 15:18:00+05	41.29935475606639	69.24020752800926	21	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
555	32	1	2026-08-21 08:25:00+05	2026-08-21 17:45:00+05	41.29936475935616	69.24005228294804	92	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
556	39	1	2026-08-21 08:18:00+05	2026-08-21 16:20:00+05	41.29928237420805	69.24023192220795	65	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
557	40	1	2026-08-21 08:07:00+05	2026-08-21 15:11:00+05	41.29987513103243	69.24043209614437	13	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
558	41	1	2026-08-21 08:03:00+05	2026-08-21 15:19:00+05	41.29963045559097	69.24037450468093	57	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
559	42	1	2026-08-21 08:21:00+05	2026-08-21 17:10:00+05	41.29958746683393	69.23978970129565	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
560	43	1	2026-08-21 08:05:00+05	2026-08-21 17:29:00+05	41.29928293308932	69.24034339556731	43	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
561	27	1	2026-08-21 08:16:00+05	2026-08-21 15:36:00+05	41.29934579362441	69.2398071299389	9	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
562	28	1	2026-08-21 08:17:00+05	2026-08-21 18:52:00+05	41.29940517516099	69.23992822727244	77	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
563	29	1	2026-08-21 08:13:00+05	2026-08-21 17:24:00+05	41.29934722803757	69.24034734169729	47	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
564	33	1	2026-08-22 08:14:00+05	2026-08-22 16:16:00+05	41.29978011947405	69.2399938244054	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
565	34	1	2026-08-22 08:00:00+05	2026-08-22 16:12:00+05	41.29918779579662	69.23985797701832	88	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
566	35	1	2026-08-22 08:24:00+05	2026-08-22 18:27:00+05	41.299190942880884	69.23982819957453	40	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
567	36	1	2026-08-22 08:04:00+05	2026-08-22 17:19:00+05	41.29924472429156	69.24017942583673	80	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
568	37	1	2026-08-22 08:00:00+05	2026-08-22 18:34:00+05	41.29959634532705	69.23999391386677	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
569	30	1	2026-08-22 08:09:00+05	2026-08-22 16:06:00+05	41.29947102962397	69.24026003501639	62	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
570	31	1	2026-08-22 08:21:00+05	2026-08-22 18:16:00+05	41.2992392801594	69.2397378261216	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
571	32	1	2026-08-22 08:11:00+05	2026-08-22 16:40:00+05	41.29957377437297	69.24022579541337	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
572	39	1	2026-08-22 08:13:00+05	2026-08-22 18:15:00+05	41.29915402451344	69.23972580040135	90	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
573	40	1	2026-08-22 08:24:00+05	2026-08-22 15:05:00+05	41.2996791579593	69.24037279289085	84	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
574	41	1	2026-08-22 08:19:00+05	2026-08-22 15:30:00+05	41.29959368637931	69.24002141565512	38	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
575	42	1	2026-08-22 08:20:00+05	2026-08-22 15:03:00+05	41.29935101122819	69.24043599487561	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
576	43	1	2026-08-22 08:02:00+05	2026-08-22 18:42:00+05	41.29925539700855	69.24029574604742	60	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
577	26	1	2026-08-22 08:08:00+05	2026-08-22 16:05:00+05	41.299114825997506	69.23993806447703	69	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
578	28	1	2026-08-22 08:21:00+05	2026-08-22 15:43:00+05	41.29944087658692	69.24026212610174	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
579	29	1	2026-08-22 08:21:00+05	2026-08-22 18:15:00+05	41.299732441304066	69.2402517290363	6	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
580	34	1	2026-08-24 08:17:00+05	2026-08-24 17:53:00+05	41.299687011121776	69.24038375838194	48	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
581	35	1	2026-08-24 08:06:00+05	2026-08-24 18:31:00+05	41.29939313693941	69.23995433679856	68	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
582	37	1	2026-08-24 08:20:00+05	2026-08-24 18:33:00+05	41.29937542101797	69.24028926268387	76	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
583	38	1	2026-08-24 08:15:00+05	2026-08-24 18:08:00+05	41.299376282369536	69.23973354959898	70	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
584	30	1	2026-08-24 08:02:00+05	2026-08-24 17:07:00+05	41.299456110466835	69.23972369938008	47	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
585	31	1	2026-08-24 08:18:00+05	2026-08-24 17:47:00+05	41.299852246650126	69.24028604609855	73	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
586	32	1	2026-08-24 08:05:00+05	2026-08-24 17:04:00+05	41.29918238267563	69.2402654895734	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
587	39	1	2026-08-24 08:11:00+05	2026-08-24 17:43:00+05	41.299583001634296	69.24008236152753	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
588	40	1	2026-08-24 08:21:00+05	2026-08-24 18:34:00+05	41.29972227809355	69.23973446111138	37	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
589	41	1	2026-08-24 08:24:00+05	2026-08-24 15:47:00+05	41.29927597191427	69.23997442115024	42	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
590	42	1	2026-08-24 08:14:00+05	2026-08-24 18:17:00+05	41.29946833314188	69.24003535071444	23	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
591	43	1	2026-08-24 08:17:00+05	2026-08-24 16:24:00+05	41.29966633710675	69.24033187418524	93	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
592	27	1	2026-08-24 08:04:00+05	2026-08-24 16:02:00+05	41.29980035095625	69.23971673195958	30	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
593	28	1	2026-08-24 08:18:00+05	2026-08-24 15:44:00+05	41.29920975891743	69.24034279579557	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
594	29	1	2026-08-24 08:10:00+05	2026-08-24 18:02:00+05	41.299722899113966	69.23976426205132	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
595	33	1	2026-08-25 08:19:00+05	2026-08-25 17:23:00+05	41.29935383058824	69.24001669660117	49	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
596	34	1	2026-08-25 08:23:00+05	2026-08-25 17:27:00+05	41.2998521395728	69.24018864929248	27	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
597	35	1	2026-08-25 08:13:00+05	2026-08-25 15:45:00+05	41.29985356479213	69.23990594351348	46	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
598	36	1	2026-08-25 08:16:00+05	2026-08-25 17:55:00+05	41.29972095160708	69.24005546818263	88	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
599	37	1	2026-08-25 08:02:00+05	2026-08-25 18:44:00+05	41.299796566109734	69.23987724995072	10	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
600	38	1	2026-08-25 08:02:00+05	2026-08-25 16:26:00+05	41.29936563006472	69.24024490902964	32	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
601	30	1	2026-08-25 08:10:00+05	2026-08-25 15:35:00+05	41.299360626059396	69.24033503304068	75	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
602	31	1	2026-08-25 08:16:00+05	2026-08-25 16:53:00+05	41.299515328124166	69.24002960828412	59	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
603	32	1	2026-08-25 08:06:00+05	2026-08-25 15:19:00+05	41.29960186075345	69.24048629430085	39	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
604	39	1	2026-08-25 08:17:00+05	2026-08-25 17:09:00+05	41.29950293826592	69.23980624368247	19	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
605	40	1	2026-08-25 08:00:00+05	2026-08-25 15:53:00+05	41.29962866332271	69.24021652715746	94	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
606	41	1	2026-08-25 08:25:00+05	2026-08-25 16:39:00+05	41.299153438752704	69.23973252967112	61	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.665986+05	2026-08-26 23:09:49.665986+05
607	42	1	2026-08-25 08:18:00+05	2026-08-25 16:06:00+05	41.2996487496635	69.24026082500666	53	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.673181+05	2026-08-26 23:09:49.673181+05
608	43	1	2026-08-25 08:10:00+05	2026-08-25 18:36:00+05	41.299367137373984	69.23970743025598	12	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.673181+05	2026-08-26 23:09:49.673181+05
609	26	1	2026-08-25 08:07:00+05	2026-08-25 18:12:00+05	41.29927195881978	69.23970534804742	60	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.673181+05	2026-08-26 23:09:49.673181+05
610	27	1	2026-08-25 08:19:00+05	2026-08-25 17:54:00+05	41.29915675193593	69.23978747526687	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.673181+05	2026-08-26 23:09:49.673181+05
611	28	1	2026-08-25 08:00:00+05	2026-08-25 18:47:00+05	41.29984346099757	69.23995470075123	60	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.673181+05	2026-08-26 23:09:49.673181+05
612	29	1	2026-08-25 08:03:00+05	2026-08-25 15:17:00+05	41.29987143264227	69.23985604514424	71	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.673181+05	2026-08-26 23:09:49.673181+05
613	33	1	2026-08-26 19:09:49.673+05	\N	41.2995	69.2401	5	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.674265+05	2026-08-26 23:09:49.674265+05
614	34	1	2026-08-26 19:09:49.674+05	\N	41.2995	69.2401	41	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.674966+05	2026-08-26 23:09:49.674966+05
615	35	1	2026-08-26 18:09:49.675+05	\N	41.2995	69.2401	16	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.675614+05	2026-08-26 23:09:49.675614+05
616	36	1	2026-08-26 19:09:49.675+05	\N	41.2995	69.2401	28	\N	\N	\N	f	\N	\N	\N	2026-08-26 23:09:49.676096+05	2026-08-26 23:09:49.676096+05
\.


--
-- Data for Name: user_branches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_branches (user_id, branch_id, is_primary, created_at) FROM stdin;
1	1	t	2026-08-26 22:22:19.48307+05
26	1	t	2026-08-26 23:09:49.581944+05
27	1	t	2026-08-26 23:09:49.584608+05
28	1	t	2026-08-26 23:09:49.587021+05
29	1	t	2026-08-26 23:09:49.589474+05
30	8	t	2026-08-26 23:09:49.591436+05
31	1	t	2026-08-26 23:09:49.593647+05
32	1	t	2026-08-26 23:09:49.595601+05
33	1	t	2026-08-26 23:09:49.598112+05
34	1	t	2026-08-26 23:09:49.600129+05
35	8	t	2026-08-26 23:09:49.602046+05
36	1	t	2026-08-26 23:09:49.604256+05
37	1	t	2026-08-26 23:09:49.605876+05
38	1	t	2026-08-26 23:09:49.608291+05
39	1	t	2026-08-26 23:09:49.610798+05
40	8	t	2026-08-26 23:09:49.613409+05
41	1	t	2026-08-26 23:09:49.616193+05
42	1	t	2026-08-26 23:09:49.619066+05
43	1	t	2026-08-26 23:09:49.621993+05
44	1	t	2026-08-26 23:09:49.625467+05
45	8	t	2026-08-26 23:09:49.628713+05
46	1	t	2026-08-26 23:09:49.63081+05
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (user_id, role, granted_by, granted_at) FROM stdin;
1	ceo	1	2026-08-26 22:22:19.48307+05
26	seller	1	2026-08-26 23:09:49.581074+05
27	seller	1	2026-08-26 23:09:49.584181+05
28	seller	1	2026-08-26 23:09:49.586515+05
29	seller	1	2026-08-26 23:09:49.588704+05
30	master	1	2026-08-26 23:09:49.591052+05
31	master	1	2026-08-26 23:09:49.593214+05
32	master	1	2026-08-26 23:09:49.595218+05
33	sewer	1	2026-08-26 23:09:49.597714+05
34	sewer	1	2026-08-26 23:09:49.599592+05
35	sewer	1	2026-08-26 23:09:49.601694+05
36	sewer	1	2026-08-26 23:09:49.603874+05
37	sewer	1	2026-08-26 23:09:49.605512+05
38	sewer	1	2026-08-26 23:09:49.607805+05
39	qc	1	2026-08-26 23:09:49.61+05
40	qc	1	2026-08-26 23:09:49.612895+05
41	installer	1	2026-08-26 23:09:49.615568+05
42	installer	1	2026-08-26 23:09:49.618558+05
43	installer	1	2026-08-26 23:09:49.621043+05
44	admin	1	2026-08-26 23:09:49.624422+05
45	admin	1	2026-08-26 23:09:49.628042+05
46	smm	1	2026-08-26 23:09:49.630431+05
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, full_name, phone, password_hash, telegram_id, avatar_storage_key, hired_at, is_active, last_login_at, created_at, updated_at, employee_code, job_title, department, employment_type, birth_date, fired_at) FROM stdin;
26	Малика Юсупова	+998931000000	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2023-03-26	t	\N	2026-08-26 23:09:49.578297+05	2026-08-26 23:09:49.579+05	EMP-2023-0026	Продавец-консультант	sales	permanent	1997-01-01	\N
27	Дилноза Турсунова	+998931000001	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2026-06-26	t	\N	2026-08-26 23:09:49.583113+05	2026-08-26 23:09:49.583+05	EMP-2026-0027	Продавец-консультант	sales	probation	2002-06-08	\N
28	Фарух Расулов	+998931000002	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2025-02-26	t	\N	2026-08-26 23:09:49.585106+05	2026-08-26 23:09:49.585+05	EMP-2025-0028	Продавец-консультант	sales	permanent	1993-11-15	\N
29	Севара Ким	+998931000003	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2021-04-26	t	\N	2026-08-26 23:09:49.587569+05	2026-08-26 23:09:49.587+05	EMP-2021-0029	Старший продавец	sales	permanent	1988-04-22	\N
30	Азиз Абдуллаев	+998931000004	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2021-02-26	t	\N	2026-08-26 23:09:49.5901+05	2026-08-26 23:09:49.59+05	EMP-2021-0030	Мастер-замерщик	sewing	permanent	1991-09-02	\N
31	Бобур Каримов	+998931000005	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2024-05-26	t	\N	2026-08-26 23:09:49.591882+05	2026-08-26 23:09:49.592+05	EMP-2024-0031	Мастер-замерщик	sewing	permanent	1995-02-09	\N
32	Шухрат Ибрагимов	+998931000006	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2022-09-26	t	\N	2026-08-26 23:09:49.594126+05	2026-08-26 23:09:49.594+05	EMP-2022-0032	Раскройщик	cutting	permanent	1984-07-16	\N
34	Гулнора Сайфиева	+998931000008	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2023-11-26	t	\N	2026-08-26 23:09:49.598526+05	2026-08-26 23:09:49.598+05	EMP-2023-0034	Швея	sewing	permanent	1996-05-03	\N
35	Нигора Азизова	+998931000009	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2025-12-26	t	\N	2026-08-26 23:09:49.600681+05	2026-08-26 23:09:49.6+05	EMP-2025-0035	Швея	sewing	temporary	2004-10-10	\N
36	Феруза Хакимова	+998931000010	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2020-08-26	t	\N	2026-08-26 23:09:49.602553+05	2026-08-26 23:09:49.602+05	EMP-2020-0036	Швея	sewing	permanent	1981-03-17	\N
37	Мадина Юлдашева	+998931000011	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2026-05-26	t	\N	2026-08-26 23:09:49.604664+05	2026-08-26 23:09:49.604+05	EMP-2026-0037	Швея	sewing	intern	2007-08-24	\N
38	Ойша Рахимова	+998931000012	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2024-11-26	t	\N	2026-08-26 23:09:49.606387+05	2026-08-26 23:09:49.606+05	EMP-2024-0038	Швея-закройщица	cutting	permanent	1992-01-04	\N
39	Нилуфар Ахмедова	+998931000013	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2023-01-26	t	\N	2026-08-26 23:09:49.608789+05	2026-08-26 23:09:49.609+05	EMP-2023-0039	Контролёр ОТК	quality	permanent	1989-06-11	\N
40	Камола Рустамова	+998931000014	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2025-06-26	t	\N	2026-08-26 23:09:49.611534+05	2026-08-26 23:09:49.611+05	EMP-2025-0040	Контролёр ОТК	quality	permanent	1998-11-18	\N
42	Жасур Тошматов	+998931000016	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2024-03-26	t	\N	2026-08-26 23:09:49.61685+05	2026-08-26 23:09:49.617+05	EMP-2024-0042	Установщик	installation	permanent	2000-09-05	\N
43	Отабек Нурматов	+998931000017	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2026-03-26	t	\N	2026-08-26 23:09:49.619666+05	2026-08-26 23:09:49.619+05	EMP-2026-0043	Установщик	installation	temporary	2003-02-12	\N
44	Дилшод Мирзаев	+998931000018	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2022-01-26	t	\N	2026-08-26 23:09:49.622988+05	2026-08-26 23:09:49.623+05	EMP-2022-0044	Администратор производства	administration	permanent	1986-07-19	\N
33	Зухра Нормуродова	+998931000007	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2022-07-26	t	2026-08-27 03:05:59.813+05	2026-08-26 23:09:49.596342+05	2026-08-27 03:05:59.813+05	EMP-2022-0033	Швея	sewing	permanent	1999-12-23	\N
41	Рустам Каримов	+998931000015	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2022-04-26	t	2026-08-27 03:05:59.912+05	2026-08-26 23:09:49.614101+05	2026-08-27 03:05:59.912+05	EMP-2022-0041	Установщик	installation	permanent	1994-04-25	\N
46	Санжар Холматов	+998931000020	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2025-09-26	t	2026-08-27 03:05:59.611+05	2026-08-26 23:09:49.629377+05	2026-08-27 03:05:59.611+05	EMP-2025-0046	SMM-менеджер	other	permanent	2001-05-06	\N
45	Зарина Юсупова	+998931000019	scrypt$32768$8$1$zMNmd5rRc3YyxfEBQ/yDxA==$jxBaU9evBtl2UD7aI+x3dwpcnvC0jQpPBJrlw18htnTUE72qakXGkGRB8ocyoryJfQ3lxMM1qCtogwQd2+7H4Q==	\N	\N	2025-01-26	t	2026-08-27 03:16:23.956+05	2026-08-26 23:09:49.626273+05	2026-08-27 03:16:23.957+05	EMP-2025-0045	Администратор	administration	permanent	1995-12-26	\N
1	Директор	+998901234567	scrypt$32768$8$1$FmHL/A/UhYefBA87w+OHaA==$2jWdt0ZsnrxIneHaTM/a35jOQ37LF4Ho2bCQ5QGPOLNzlkkMU2tDxOHeH2H1hbCoyQPxkyxtMzeJtdof0JqGSg==	\N	\N	\N	t	2026-08-27 03:05:59.483+05	2026-08-26 22:22:19.48307+05	2026-08-27 03:05:59.483+05	\N	\N	other	permanent	\N	\N
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: -
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 2, true);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 715, true);


--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.branches_id_seq', 13, true);


--
-- Name: catalog_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.catalog_items_id_seq', 202, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1279, true);


--
-- Name: order_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_comments_id_seq', 22, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 150, true);


--
-- Name: order_photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_photos_id_seq', 2, true);


--
-- Name: order_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_status_history_id_seq', 625, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 74, true);


--
-- Name: payroll_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payroll_records_id_seq', 42, true);


--
-- Name: payroll_schemes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payroll_schemes_id_seq', 9, true);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_items_id_seq', 19, true);


--
-- Name: purchases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchases_id_seq', 98, true);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 56, true);


--
-- Name: shifts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shifts_id_seq', 621, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 63, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: catalog_items catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_comments order_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_comments
    ADD CONSTRAINT order_comments_pkey PRIMARY KEY (id);


--
-- Name: order_installation_team order_installation_team_order_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_installation_team
    ADD CONSTRAINT order_installation_team_order_id_user_id_pk PRIMARY KEY (order_id, user_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_photos order_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_photos
    ADD CONSTRAINT order_photos_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payroll_records payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);


--
-- Name: payroll_schemes payroll_schemes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_schemes
    ADD CONSTRAINT payroll_schemes_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: user_branches user_branches_user_id_branch_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_user_id_branch_id_pk PRIMARY KEY (user_id, branch_id);


--
-- Name: user_roles user_roles_user_id_role_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_pk PRIMARY KEY (user_id, role);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_action_idx ON public.audit_log USING btree (action, created_at);


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_actor_idx ON public.audit_log USING btree (actor_id, created_at);


--
-- Name: audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at);


--
-- Name: audit_log_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: branches_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_is_active_idx ON public.branches USING btree (is_active);


--
-- Name: branches_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_name_unique ON public.branches USING btree (lower(name));


--
-- Name: catalog_items_kind_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_items_kind_active_idx ON public.catalog_items USING btree (kind, is_active, sort_order);


--
-- Name: catalog_items_kind_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_items_kind_name_unique ON public.catalog_items USING btree (kind, lower(name));


--
-- Name: notifications_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_order_idx ON public.notifications USING btree (related_order_id);


--
-- Name: notifications_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at);


--
-- Name: notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id) WHERE (NOT is_read);


--
-- Name: order_comments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_comments_order_idx ON public.order_comments USING btree (order_id, created_at);


--
-- Name: order_comments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_comments_user_idx ON public.order_comments USING btree (user_id);


--
-- Name: order_comments_voice_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX order_comments_voice_key_unique ON public.order_comments USING btree (voice_storage_key);


--
-- Name: order_installation_team_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_installation_team_user_idx ON public.order_installation_team USING btree (user_id);


--
-- Name: order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id, "position");


--
-- Name: order_photos_order_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_photos_order_stage_idx ON public.order_photos USING btree (order_id, stage);


--
-- Name: order_photos_storage_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX order_photos_storage_key_unique ON public.order_photos USING btree (storage_key);


--
-- Name: order_photos_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_photos_uploaded_by_idx ON public.order_photos USING btree (uploaded_by);


--
-- Name: order_status_history_changed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_status_history_changed_by_idx ON public.order_status_history USING btree (changed_by);


--
-- Name: order_status_history_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_status_history_order_idx ON public.order_status_history USING btree (order_id, created_at);


--
-- Name: order_status_history_to_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_status_history_to_status_idx ON public.order_status_history USING btree (to_status);


--
-- Name: orders_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_branch_idx ON public.orders USING btree (branch_id);


--
-- Name: orders_branch_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_branch_status_created_idx ON public.orders USING btree (branch_id, status, created_at);


--
-- Name: orders_client_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_client_phone_idx ON public.orders USING btree (client_phone);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at);


--
-- Name: orders_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_by_idx ON public.orders USING btree (created_by);


--
-- Name: orders_deadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_deadline_idx ON public.orders USING btree (deadline);


--
-- Name: orders_installer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_installer_idx ON public.orders USING btree (installer_id);


--
-- Name: orders_master_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_master_idx ON public.orders USING btree (master_id);


--
-- Name: orders_order_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_order_number_unique ON public.orders USING btree (order_number);


--
-- Name: orders_qc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_qc_idx ON public.orders USING btree (qc_id);


--
-- Name: orders_sewer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_sewer_idx ON public.orders USING btree (sewer_id);


--
-- Name: orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_idx ON public.orders USING btree (status);


--
-- Name: payroll_records_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_records_period_idx ON public.payroll_records USING btree (period_year, period_month, status);


--
-- Name: payroll_records_period_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_records_period_unique ON public.payroll_records USING btree (user_id, role, period_year, period_month);


--
-- Name: payroll_records_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_records_user_idx ON public.payroll_records USING btree (user_id);


--
-- Name: payroll_schemes_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_schemes_role_idx ON public.payroll_schemes USING btree (role, effective_from);


--
-- Name: payroll_schemes_single_active_per_role; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_schemes_single_active_per_role ON public.payroll_schemes USING btree (role) WHERE is_active;


--
-- Name: purchase_items_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_items_category_idx ON public.purchase_items USING btree (category, is_active);


--
-- Name: purchase_items_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_items_name_unique ON public.purchase_items USING btree (lower(name));


--
-- Name: purchases_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_created_at_idx ON public.purchases USING btree (created_at);


--
-- Name: purchases_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_item_idx ON public.purchases USING btree (item_id);


--
-- Name: purchases_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_order_idx ON public.purchases USING btree (order_id);


--
-- Name: refresh_tokens_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_expires_idx ON public.refresh_tokens USING btree (expires_at);


--
-- Name: refresh_tokens_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_tokens_hash_unique ON public.refresh_tokens USING btree (token_hash);


--
-- Name: refresh_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: shifts_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_branch_idx ON public.shifts USING btree (branch_id);


--
-- Name: shifts_single_open_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shifts_single_open_per_user ON public.shifts USING btree (user_id) WHERE (ended_at IS NULL);


--
-- Name: shifts_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_started_at_idx ON public.shifts USING btree (started_at);


--
-- Name: shifts_user_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_user_started_idx ON public.shifts USING btree (user_id, started_at);


--
-- Name: user_branches_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_branches_branch_idx ON public.user_branches USING btree (branch_id);


--
-- Name: user_branches_single_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_branches_single_primary ON public.user_branches USING btree (user_id) WHERE is_primary;


--
-- Name: user_roles_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_roles_role_idx ON public.user_roles USING btree (role);


--
-- Name: users_birthday_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_birthday_idx ON public.users USING btree (EXTRACT(month FROM birth_date), EXTRACT(day FROM birth_date));


--
-- Name: users_department_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_department_idx ON public.users USING btree (department);


--
-- Name: users_employee_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_employee_code_unique ON public.users USING btree (employee_code);


--
-- Name: users_full_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_full_name_idx ON public.users USING btree (full_name);


--
-- Name: users_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_is_active_idx ON public.users USING btree (is_active);


--
-- Name: users_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_phone_unique ON public.users USING btree (phone);


--
-- Name: users_telegram_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_telegram_id_unique ON public.users USING btree (telegram_id);


--
-- Name: audit_log audit_log_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: catalog_items catalog_items_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_related_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_order_id_orders_id_fk FOREIGN KEY (related_order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_comments order_comments_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_comments
    ADD CONSTRAINT order_comments_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_comments order_comments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_comments
    ADD CONSTRAINT order_comments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: order_installation_team order_installation_team_added_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_installation_team
    ADD CONSTRAINT order_installation_team_added_by_users_id_fk FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: order_installation_team order_installation_team_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_installation_team
    ADD CONSTRAINT order_installation_team_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_installation_team order_installation_team_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_installation_team
    ADD CONSTRAINT order_installation_team_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_photos order_photos_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_photos
    ADD CONSTRAINT order_photos_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_photos order_photos_uploaded_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_photos
    ADD CONSTRAINT order_photos_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: order_status_history order_status_history_changed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_users_id_fk FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: order_status_history order_status_history_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_branch_id_branches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_branches_id_fk FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: orders orders_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_installer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_installer_id_users_id_fk FOREIGN KEY (installer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_master_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_master_id_users_id_fk FOREIGN KEY (master_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_qc_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_qc_id_users_id_fk FOREIGN KEY (qc_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_sewer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_sewer_id_users_id_fk FOREIGN KEY (sewer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payroll_records payroll_records_approved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payroll_records payroll_records_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: payroll_schemes payroll_schemes_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_schemes
    ADD CONSTRAINT payroll_schemes_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: purchase_items purchase_items_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_item_id_purchase_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_item_id_purchase_items_id_fk FOREIGN KEY (item_id) REFERENCES public.purchase_items(id) ON DELETE RESTRICT;


--
-- Name: purchases purchases_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_adjusted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_adjusted_by_users_id_fk FOREIGN KEY (adjusted_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: shifts shifts_branch_id_branches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_branch_id_branches_id_fk FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: shifts shifts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_branches user_branches_branch_id_branches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_branch_id_branches_id_fk FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: user_branches user_branches_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branches
    ADD CONSTRAINT user_branches_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_granted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_granted_by_users_id_fk FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict cPcLQn7L1A5qC6LeFJPSHl8Ok2Qn8mtoHsApw5wEY8GUeWH9HCaSALvUl26AIyZ

