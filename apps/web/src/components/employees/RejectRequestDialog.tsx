'use client';

import { useState, type ReactElement } from 'react';

import { Button, FormError, Modal, Textarea } from '@/components/ui/Form';

/**
 * Отказ в запросе сотрудника — на выходной или на опоздание.
 *
 * Окно одно на оба вида: отказ без причины сервер не примет, и руководитель
 * должен видеть одинаковый вопрос, что бы ни отклонял. Две копии окна
 * разошлись бы подсказкой или порогом длины при первой же правке одной.
 *
 * Монтируется только на время отказа (вызывающий рисует его, пока выбран
 * запрос), поэтому причина в поле не переезжает со вчерашнего отказа на
 * сегодняшний: новое окно — пустое поле.
 */
export function RejectRequestDialog({
  title,
  maxLength,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  readonly title: string;
  readonly maxLength: number;
  readonly isPending: boolean;
  /** Ответ сервера на прошлую попытку — показывается как есть. */
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => void;
}): ReactElement {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={isPending}
            // Те же 3 символа, что требует сервер: «-» или «нет» причиной не
            // считаются, и кнопка не даёт отправить заведомый отказ сервера.
            disabled={trimmed.length < 3}
            onClick={() => {
              onSubmit(trimmed);
            }}
          >
            Отклонить запрос
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError message={error} />
        <Textarea
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          rows={2}
          maxLength={maxLength}
          aria-label="Причина отказа"
          // Причина отказа уходит не только сотруднику: владелец попросил
          // писать её и в группу цеха в Telegram. Руководитель должен знать
          // это до того, как напишет.
          placeholder="Причина — её увидят сотрудник и группа цеха в Telegram"
        />
      </div>
    </Modal>
  );
}
