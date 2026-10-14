'use client';

import { MonitorGroup } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { MonitorBoardPage } from '@/components/monitor/MonitorBoard';

export default function InstallationMonitorPage(): ReactElement {
  return <MonitorBoardPage group={MonitorGroup.INSTALLATION} />;
}
