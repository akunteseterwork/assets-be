const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  try {
    const existingSuperAdmin = await prisma.user.findFirst({
      where: {
        role: 'superadmin',
      },
    });

    if (existingSuperAdmin) {
      console.log('Superadmin user already exists.');
      return;
    }

    const hashedPassword = await bcrypt.hash(process.env.SUPERADMIN_PW, 10);

    const superadminUser = await prisma.user.create({
      data: {
        username: 'superadmin',
        email: 'superadmin@assets-downloader.com',
        password: hashedPassword,
        role: 'superadmin',
        status: 'active',
      },
    });

    console.log('Superadmin user seeded successfully:', superadminUser);
  } catch (error) {
    console.error('Error seeding superadmin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSuperAdmin();
