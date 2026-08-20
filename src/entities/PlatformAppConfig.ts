import { Entity, Column } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// Global (not tenant-scoped) mobile app configuration — a single row,
// managed by the platform owner. Controls which Home screen top tabs and
// quick-action icons the mobile app shows to every patient, across every
// tenant. See modules/app-config for the public read endpoint the mobile
// app polls, and modules/platform for the platform-owner write endpoint.
@Entity('platform_app_config')
export class PlatformAppConfig extends BaseEntity {
  @Column({ name: 'top_tab_health', default: true })
  topTabHealth!: boolean;

  @Column({ name: 'top_tab_ai_doctor', default: true })
  topTabAiDoctor!: boolean;

  @Column({ name: 'top_tab_women', default: true })
  topTabWomen!: boolean;

  @Column({ name: 'quick_action_doctor', default: true })
  quickActionDoctor!: boolean;

  @Column({ name: 'quick_action_pharmacy', default: true })
  quickActionPharmacy!: boolean;

  @Column({ name: 'quick_action_prescription', default: true })
  quickActionPrescription!: boolean;

  @Column({ name: 'quick_action_hospital', default: true })
  quickActionHospital!: boolean;

  @Column({ name: 'quick_action_ambulance', default: true })
  quickActionAmbulance!: boolean;

  @Column({ name: 'section_promo_banner', default: true })
  sectionPromoBanner!: boolean;

  @Column({ name: 'section_top_doctors', default: true })
  sectionTopDoctors!: boolean;

  @Column({ name: 'section_health_articles', default: true })
  sectionHealthArticles!: boolean;

  // Home is never configurable — it's the only way back to everything
  // else, so it always shows.
  @Column({ name: 'bottom_nav_message', default: true })
  bottomNavMessage!: boolean;

  @Column({ name: 'bottom_nav_calendar', default: true })
  bottomNavCalendar!: boolean;

  @Column({ name: 'bottom_nav_profile', default: true })
  bottomNavProfile!: boolean;

  // Business identity details — set once from the Policies admin page,
  // reused every time a policy is AI-generated (see
  // PlatformService.generatePolicyContent) instead of falling back to
  // bracketed placeholders, and shown for reference at the top of that
  // page. Not otherwise displayed anywhere.
  @Column({ name: 'support_email', nullable: true })
  supportEmail?: string;

  @Column({ name: 'legal_entity_name', nullable: true })
  legalEntityName?: string;

  @Column({ name: 'registered_address', type: 'text', nullable: true })
  registeredAddress?: string;

  @Column({ name: 'support_phone', nullable: true })
  supportPhone?: string;
}
