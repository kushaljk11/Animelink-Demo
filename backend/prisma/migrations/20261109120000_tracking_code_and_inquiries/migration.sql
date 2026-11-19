-- AlterTable
ALTER TABLE "bite_incidents" ADD COLUMN     "tracking_code" TEXT NOT NULL DEFAULT ('NP-'::text || upper(substr(md5((random())::text), 1, 4)) || '-'::text || upper(substr(md5((random())::text), 1, 4)));

-- CreateTable
CREATE TABLE "inquiries" (
    "inquiry_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("inquiry_id")
);

-- CreateIndex
CREATE INDEX "inquiries_status_created_at_idx" ON "inquiries"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bite_incidents_tracking_code_key" ON "bite_incidents"("tracking_code");

-- CreateIndex
CREATE INDEX "bite_incidents_reporter_phone_idx" ON "bite_incidents"("reporter_phone");

