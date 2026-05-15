import csv
import os
import random

classes = [
    ("LKG", 2020),
    ("UKG", 2019),
    ("Class_1", 2018),
    ("Class_2", 2017),
    ("Class_3", 2016),
    ("Class_4", 2015),
    ("Class_5", 2014),
    ("Class_6", 2013),
    ("Class_7", 2012),
    ("Class_8", 2011)
]

names_male = ["Aarav", "Advik", "Akash", "Anay", "Arjun", "Bhavin", "Chaitanya", "Dev", "Eshan", "Gaurav", "Hrithik", "Ishaan", "Jatin", "Kabir", "Laksh", "Manav", "Nakul", "Ojas", "Pranav", "Rohan"]
names_female = ["Aanya", "Ananya", "Bhavya", "Diya", "Ira", "Ishani", "Jiya", "Kavya", "Kyra", "Myra", "Navya", "Pari", "Prisha", "Riya", "Saanvi", "Sanya", "Tanvi", "Vanya", "Zara", "Zoya"]
surnames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Reddy", "Patel", "Mehta", "Jain", "Bhat", "Rao", "Nair", "Iyer", "Sen", "Das"]

base_path = r"c:\Users\cgc\OneDrive\Desktop\pending projects\School-erp\sample_data"

if not os.path.exists(base_path):
    os.makedirs(base_path)

for class_name, birth_year in classes:
    filename = os.path.join(base_path, f"students_{class_name.lower()}.csv")
    with open(filename, 'w', newline='') as csvfile:
        fieldnames = ['Roll No', 'Name', "Father's Name", "Mother's Name", 'DOB', 'Gender', 'Contact', 'Address']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        for i in range(1, 11):
            gender = random.choice(["Male", "Female"])
            first_name = random.choice(names_male if gender == "Male" else names_female)
            last_name = random.choice(surnames)
            full_name = f"{first_name} {last_name}"
            
            father_first = random.choice(names_male)
            father_name = f"{father_first} {last_name}"
            
            mother_first = random.choice(names_female)
            mother_name = f"{mother_first} {last_name}"
            
            dob = f"{birth_year}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}"
            roll_no = f"{class_name[0]}{i:02d}"
            contact = f"9{random.randint(100000000, 999999999)}"
            address = f"Sector {random.randint(1, 100)}, Noida"
            
            writer.writerow({
                'Roll No': roll_no,
                'Name': full_name,
                "Father's Name": father_name,
                "Mother's Name": mother_name,
                'DOB': dob,
                'Gender': gender,
                'Contact': contact,
                'Address': address
            })

print("Generated all class data successfully.")
