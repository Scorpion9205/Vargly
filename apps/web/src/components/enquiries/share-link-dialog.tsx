'use client';

import { Copy, Download, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { enquiryLink } from '@/lib/enquiry-link';
import { useCoachingProfile } from '@/lib/queries';

interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareLinkDialog({ open, onOpenChange }: ShareLinkDialogProps) {
  const t = useTranslations('Enquiries.share');
  const common = useTranslations('Common');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      closeLabel={common('close')}
    >
      {open ? <ShareLink /> : null}
    </Dialog>
  );
}

function ShareLink() {
  const t = useTranslations('Enquiries.share');
  const profile = useCoachingProfile();
  const link = profile.data ? enquiryLink(profile.data.code) : null;
  const [qr, setQr] = useState<{ link: string; image: string } | null>(null);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
      .then((image) => {
        if (!cancelled) setQr({ link, image });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (!link) return <Skeleton className="h-64 rounded-xl" aria-busy="true" />;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const whatsappText = encodeURIComponent(t('shareText', { link }));

  return (
    <div className="flex flex-col items-center gap-5">
      {qr?.link === link ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise
        <img src={qr.image} alt={t('qrAlt')} width={240} height={240} className="rounded-xl border bg-white p-2" />
      ) : (
        <Skeleton className="size-60 rounded-xl" aria-busy="true" />
      )}
      <p className="w-full rounded-lg border bg-muted px-3 py-2 text-center text-sm break-all">{link}</p>
      <div className="flex w-full flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => void copy()}>
          <Copy aria-hidden />
          {t('copy')}
        </Button>
        <Button asChild variant="outline">
          <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t('whatsapp')}
          </a>
        </Button>
        {qr?.link === link ? (
          <Button asChild variant="outline">
            <a href={qr.image} download="enquiry-qr.png">
              <Download aria-hidden />
              {t('download')}
            </a>
          </Button>
        ) : null}
      </div>
      <p className="text-center text-sm text-muted-foreground">{t('hint')}</p>
    </div>
  );
}
