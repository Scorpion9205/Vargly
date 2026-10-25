-- Student logins: a student can have their own user account, which must replace its temporary password.
-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "students" ADD COLUMN "user_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A student's login must belong to the student's own coaching (see the same-tenant migration)
DROP TRIGGER IF EXISTS same_tenant_users ON students;
CREATE TRIGGER same_tenant_users BEFORE INSERT OR UPDATE OF user_id, coaching_id ON students
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant_reference('user_id', 'users');
