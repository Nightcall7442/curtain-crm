'use client';

import { MonitorGroup } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { MonitorBoardPage } from '@/components/monitor/MonitorBoard';

export default function WorkshopMonitorPage(): ReactElement {
  return <MonitorBoardPage group={MonitorGroup.WORKSHOP} />;
}
